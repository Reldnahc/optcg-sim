import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import type { CardId, CardInstance, MatchCardManifest } from "@optcg/types";

import { must, p1, p2 } from "./action-test-fixtures.js";
import { applyAction } from "./actions.js";
import { applyDeclareAttack } from "./battle-actions.js";
import { setupAttackState } from "./battle-actions-test-fixtures.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { processEffectRuntime } from "./effect-runtime.js";
import { targetSelectionQueueState } from "./effect-runtime-queue-processing-test-support.js";
import { applyPlayCard, applyPlayCardDecisionResponse } from "./play-card.js";
import { setupMainPlayState } from "./play-card-test-fixtures.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const plainDataClone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
const toCardId = (value: string): CardId => value as CardId;

const removeFieldCardsFromHands = (
  state: ReturnType<typeof targetSelectionQueueState>["state"],
): void => {
  for (const player of Object.values(state.players)) {
    const fieldIds = new Set(player.characters.map((card) => card.instanceId));
    player.hand = player.hand
      .filter((card) => !fieldIds.has(card.instanceId))
      .map((card, index) => ({
        ...card,
        zone: {
          zone: "hand",
          playerId: must(card.zone.playerId, "hand player"),
          slot: "hand",
          index,
        },
      }));
  }
};

test("package boundary keeps real-card runtime test free of @optcg/cards and server/client imports", async () => {
  const source = await readFile(fileURLToPath(import.meta.url), "utf8");
  const importLines = source
    .split("\n")
    .filter((line) => line.trimStart().startsWith("import "));

  assert.equal(
    importLines.some((line) => line.includes('from "@optcg/cards"')),
    false,
  );
  assert.equal(
    importLines.some((line) => line.includes('from "@optcg/server"')),
    false,
  );
  assert.equal(
    importLines.some((line) => line.includes('from "@optcg/client"')),
    false,
  );
  assert.equal(
    importLines.some((line) => line.includes('from "redis"')),
    false,
  );
  assert.equal(
    importLines.some((line) => line.includes('from "pg"')),
    false,
  );
});

test("loads plain checked-in manifest/effect data and executes EB01-023 on-play draw through runtime", async () => {
  const manifestFixturePath = path.join(
    repoRoot,
    "fixtures/cards/real-card-dsl-match-card-manifest.json",
  );
  const plainManifest = plainDataClone(
    JSON.parse(
      await readFile(manifestFixturePath, "utf8"),
    ) as MatchCardManifest,
  );
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const handCard = must(p1State.hand[0], "hand card");
  const topDeck = must(p1State.deck[0], "top deck");
  const extraDonSource = must(p1State.costArea[0], "extra DON source");
  const eb01023 = toCardId("EB01-023");
  const ebCard = must(plainManifest.cards[eb01023], "EB01-023 manifest card");
  const effectDefinitionId = must(
    ebCard.support.effectDefinitionId,
    "EB01-023 effectDefinitionId",
  );
  const ebDefinition = must(
    plainManifest.effectDefinitions?.[effectDefinitionId],
    "EB01-023 effect definition",
  );

  handCard.cardId = eb01023;
  p1State.costArea.push({
    ...extraDonSource,
    instanceId:
      `${String(extraDonSource.instanceId)}:extra-cost` as CardInstance["instanceId"],
    zone: { zone: "costArea", playerId: p1, slot: "cost", index: 3 },
    state: "active",
  });
  state.cardManifest.cards = {
    ...state.cardManifest.cards,
    [ebCard.cardId]: ebCard,
  };
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: ebDefinition,
  };
  state.cardManifest.cardDataVersion = plainManifest.cardDataVersion;
  state.cardManifest.effectDefinitionsVersion =
    plainManifest.effectDefinitionsVersion;
  const beforeDeck = p1State.deck.length;
  const beforeHand = p1State.hand.length;

  const opened = applyPlayCard(state, {
    type: "playCard",
    cardInstanceId: handCard.instanceId,
  });
  assert.equal(opened.errors, undefined);
  const paymentDecision = must(
    opened.state.pendingDecision,
    "payment decision",
  );
  const openedP1 = must(opened.state.players[p1], "p1 payment");
  const selectedDonInstanceIds = openedP1.costArea
    .slice(0, 4)
    .map((card) => card.instanceId);
  const paid = applyPlayCardDecisionResponse(opened.state, {
    type: "respondToDecision",
    decisionId: paymentDecision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds,
    },
  });
  if (paid === null) {
    assert.fail("expected play-card payment response");
  }
  const played = paid;

  assert.equal(played.errors, undefined);
  const afterPlay = must(played.state.players[p1], "p1 after play");
  assert.equal(afterPlay.deck.length, beforeDeck - 1);
  assert.equal(afterPlay.hand.length, beforeHand);
  assert.equal(
    must(afterPlay.characters[0], "played character").cardId,
    eb01023,
  );
  assert.equal(
    must(afterPlay.hand[afterPlay.hand.length - 1], "drawn card").instanceId,
    topDeck.instanceId,
  );
  assert.equal(played.state.effectQueue.length, 0);
  assert.equal(played.state.pendingDecision, undefined);
  assert.equal(played.stateHash, hashCanonicalStateValue(played.state));

  const runtimePass = processEffectRuntime(played.state);
  assert.equal(runtimePass.errors, undefined);
});

test("loads cards-produced plain manifest data while resolving synthetic target KO runtime work", async () => {
  const manifestFixturePath = path.join(
    repoRoot,
    "fixtures/cards/real-card-dsl-match-card-manifest.json",
  );
  const plainManifest = plainDataClone(
    JSON.parse(
      await readFile(manifestFixturePath, "utf8"),
    ) as MatchCardManifest,
  );
  const { state } = targetSelectionQueueState();
  const existingManifest = state.cardManifest;
  const targetEntry = must(state.effectQueue[0], "target queue entry");
  const targetSourceCard = must(
    existingManifest.cards[targetEntry.source.cardId],
    "target source card",
  );
  const targetEffectDefinitionId = must(
    targetSourceCard.support.effectDefinitionId,
    "target effect definition id",
  );
  const targetEffectDefinition = must(
    existingManifest.effectDefinitions?.[targetEffectDefinitionId],
    "target effect definition",
  );
  state.cardManifest = {
    ...existingManifest,
    banlistVersion: plainManifest.banlistVersion,
    cardDataVersion: plainManifest.cardDataVersion,
    customHandlerVersion: plainManifest.customHandlerVersion,
    effectDefinitions: {
      ...plainManifest.effectDefinitions,
      ...existingManifest.effectDefinitions,
      [targetEffectDefinitionId]: {
        ...targetEffectDefinition,
        metadata: {
          ...targetEffectDefinition.metadata,
          effectDefinitionsVersion: plainManifest.effectDefinitionsVersion,
        },
      },
    },
    effectDefinitionsVersion: plainManifest.effectDefinitionsVersion,
    cards: {
      ...plainManifest.cards,
      ...existingManifest.cards,
      [targetSourceCard.cardId]: {
        ...targetSourceCard,
        support: {
          ...targetSourceCard.support,
          cardDataVersion: plainManifest.cardDataVersion,
        },
      },
    },
    source: plainManifest.source,
  };
  removeFieldCardsFromHands(state);

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target decision");
  assert.equal(decision.type, "selectTargets");

  const selected = must(decision.candidates[0], "first target").card;
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [selected] },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(resolved.state.effectQueue, []);
  assert.equal(
    resolved.state.cardManifest.cards[toCardId("EB01-023")]?.support.status,
    "implemented-dsl",
  );
  assert.equal(
    resolved.state.cardManifest.cards[toCardId("OP05-091")]?.support.status,
    "unsupported",
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardKOd",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("loads OP04-014 from plain manifest data and keeps Banish candidate fail-closed while unsupported", async () => {
  const manifestFixturePath = path.join(
    repoRoot,
    "fixtures/cards/real-card-dsl-match-card-manifest.json",
  );
  const plainManifest = plainDataClone(
    JSON.parse(
      await readFile(manifestFixturePath, "utf8"),
    ) as MatchCardManifest,
  );
  const op04014 = toCardId("OP04-014");
  const opCard = must(plainManifest.cards[op04014], "OP04-014 manifest card");
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");

  p1State.leader = {
    ...p1State.leader,
    cardId: op04014,
  };
  p2State.life[0] = {
    ...topLife,
    card: {
      ...topLife.card,
      cardId: toCardId("trigger-life"),
    },
  };
  state.cardManifest.cards = {
    ...state.cardManifest.cards,
    [op04014]: opCard,
    [toCardId("trigger-life")]: {
      ...must(state.cardManifest.cards[topLife.card.cardId], "life card"),
      cardId: toCardId("trigger-life"),
      triggerText: "[Trigger] Draw 1 card.",
    },
  };
  const before = JSON.stringify(state);

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: op04014,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  const nextP2 = must(result.state.players[p2], "p2 after damage");

  assert.equal(opCard.support.status, "unsupported");
  assert.equal(
    opCard.effectText,
    "[Banish] (When this card deals damage, the target card is trashed without activating its Trigger.)",
  );
  assert.deepEqual(opCard.printedKeywords, ["banish"]);
  assert.equal(opCard.support.effectDefinitionId, undefined);
  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "declareAttack is unsupported for current combat metadata.",
    },
  ]);
  assert.equal(result.decisions, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(nextP2.trash.length, p2State.trash.length);
  assert.equal(nextP2.hand.length, p2State.hand.length);
});
