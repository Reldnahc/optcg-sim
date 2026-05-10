import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import type { CardId, CardInstance, MatchCardManifest } from "@optcg/types";

import { must, p1 } from "./action-test-fixtures.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { processEffectRuntime } from "./effect-runtime.js";
import { applyPlayCard, applyPlayCardDecisionResponse } from "./play-card.js";
import { setupMainPlayState } from "./play-card-test-fixtures.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const plainDataClone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
const toCardId = (value: string): CardId => value as CardId;

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
