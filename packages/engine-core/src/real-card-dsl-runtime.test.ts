import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import type { CardId, CardInstance, MatchCardManifest } from "@optcg/types";

import { must, p1, p2 } from "./action-test-fixtures.js";
import { applyAction, getLegalActions } from "./actions.js";
import { applyDeclareAttack } from "./battle-actions.js";
import {
  effectDefinition,
  setupAttackState,
} from "./battle-actions-test-fixtures.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import {
  processEffectRuntime,
  resolveImplementedDslEffectDefinition,
} from "./effect-runtime.js";
import {
  queueDrawForP1,
  targetSelectionQueueState,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
} from "./effect-runtime-queue-processing-test-support.js";
import { enterMainPhase } from "./phases.js";
import { applyPlayCard, applyPlayCardDecisionResponse } from "./play-card.js";
import { setupMainPlayState } from "./play-card-test-fixtures.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const plainDataClone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
const toCardId = (value: string): CardId => value as CardId;

const loadPlainRealCardManifest = async (): Promise<MatchCardManifest> => {
  const manifestFixturePath = path.join(
    repoRoot,
    "fixtures/cards/real-card-dsl-match-card-manifest.json",
  );

  return plainDataClone(
    JSON.parse(
      await readFile(manifestFixturePath, "utf8"),
    ) as MatchCardManifest,
  );
};

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
  const plainManifest = await loadPlainRealCardManifest();
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
  const plainManifest = await loadPlainRealCardManifest();
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

test("loads OP04-014 from plain manifest data and applies Banish without mutating printed text", async () => {
  const plainManifest = await loadPlainRealCardManifest();
  const op04014 = toCardId("OP04-014");
  const opCard = must(plainManifest.cards[op04014], "OP04-014 manifest card");
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  const p2DeckSize = p2State.deck.length;
  const triggerLifeCardId = toCardId("trigger-life");
  const triggerDefinitionId = "def-real-card-banish-trigger-draw";
  const triggerDefinitionBase = effectDefinition(triggerLifeCardId, {
    type: "trigger",
  });
  const triggerEffect = must(
    triggerDefinitionBase.effects[0],
    "trigger draw effect",
  );
  const triggerEffectWithoutUnsupportedFlags = { ...triggerEffect };
  delete triggerEffectWithoutUnsupportedFlags.optional;
  delete triggerEffectWithoutUnsupportedFlags.oncePerTurn;
  const triggerDefinition = {
    ...triggerDefinitionBase,
    effects: [
      {
        ...triggerEffectWithoutUnsupportedFlags,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
      },
    ],
  };

  p1State.leader = {
    ...p1State.leader,
    cardId: op04014,
  };
  p2State.life[0] = {
    ...topLife,
    card: {
      ...topLife.card,
      cardId: triggerLifeCardId,
    },
  };
  state.cardManifest.cards = {
    ...state.cardManifest.cards,
    [op04014]: opCard,
    [triggerLifeCardId]: {
      ...must(state.cardManifest.cards[topLife.card.cardId], "life card"),
      cardId: triggerLifeCardId,
      triggerText: "[Trigger] Draw 1 card.",
      support: {
        cardId: triggerLifeCardId,
        status: "implemented-dsl",
        effectDefinitionId: triggerDefinitionId,
        tested: true,
        rulesVersion: triggerDefinition.metadata.rulesVersion,
        cardDataVersion: "fixture",
        sourceTextHash: triggerDefinition.metadata.sourceTextHash,
        behaviorHash: "behavior-hash",
      },
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    triggerDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [triggerDefinitionId]: triggerDefinition,
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

  assert.equal(opCard.support.status, "vanilla-confirmed");
  assert.equal(opCard.support.tested, true);
  assert.equal(
    opCard.effectText,
    "[Banish] (When this card deals damage, the target card is trashed without activating its Trigger.)",
  );
  assert.deepEqual(opCard.printedKeywords, ["banish"]);
  assert.equal(opCard.support.effectDefinitionId, undefined);
  assert.equal(result.errors, undefined);
  assert.equal(result.decisions, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "decisionCreated" &&
        JSON.stringify(event.payload).includes("confirmLifeTrigger"),
    ),
    false,
  );
  assert.equal(
    result.events.some((event) => event.type === "cardDrawn"),
    false,
  );
  assert.equal(JSON.stringify(state), before);
  assert.notEqual(JSON.stringify(result.state), before);
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === topLife.card.instanceId),
    true,
  );
  assert.equal(nextP2.hand.length, p2State.hand.length);
  assert.equal(nextP2.deck.length, p2DeckSize);
  assert.equal(
    result.state.cardManifest.cards[op04014]?.effectText,
    opCard.effectText,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("loads OP10-045 from plain manifest data and resolves draw-before-trash on when-attacking", async () => {
  const plainManifest = await loadPlainRealCardManifest();
  const op10045 = toCardId("OP10-045");
  const opCard = must(plainManifest.cards[op10045], "OP10-045 manifest card");
  const effectDefinitionId = must(
    opCard.support.effectDefinitionId,
    "OP10-045 effectDefinitionId",
  );
  const effectDefinition = must(
    plainManifest.effectDefinitions?.[effectDefinitionId],
    "OP10-045 effect definition",
  );
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.characters[0], "source");
  const extraDrawSource = must(p1State.hand[0], "extra draw source");
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p1State.deck.push({
    ...extraDrawSource,
    zone: {
      zone: "deck",
      playerId: p1,
      slot: "deck",
      index: p1State.deck.length,
    },
  });
  const firstDrawn = must(p1State.deck[0], "first drawn card");
  const secondDrawn = must(p1State.deck[1], "second drawn card");
  const beforeDeckSize = p1State.deck.length;
  const beforeHandSize = p1State.hand.length;

  source.cardId = op10045;
  state.cardManifest.cards = {
    ...state.cardManifest.cards,
    [op10045]: opCard,
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: effectDefinition,
  };
  state.cardManifest.cardDataVersion = plainManifest.cardDataVersion;
  state.cardManifest.effectDefinitionsVersion =
    plainManifest.effectDefinitionsVersion;

  assert.equal(opCard.support.status, "implemented-dsl");
  assert.equal(
    opCard.effectText,
    "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
  );
  assert.equal(effectDefinition.effects.length, 1);
  const effectBlock = must(effectDefinition.effects[0], "effect block");
  assert.equal(effectBlock.oncePerTurn, true);
  assert.deepEqual(effectBlock.trigger, { type: "whenAttacking" });
  assert.equal(effectBlock.effect.type, "sequence");
  assert.equal(
    must(effectBlock.effect.effects[0], "draw segment").connector,
    "always",
  );
  assert.equal(
    must(effectBlock.effect.effects[0], "draw segment").effect.type,
    "draw",
  );
  assert.equal(
    must(effectBlock.effect.effects[1], "trash segment").connector,
    "then",
  );
  assert.equal(
    must(effectBlock.effect.effects[1], "trash segment").effect.type,
    "trashFromHand",
  );

  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-op10-045-generated-support"),
      timingWindowId: toTimingWindowId(
        "timing-window-op10-045-generated-support",
      ),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: op10045,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: effectBlock.id,
      sourcePresencePolicy: must(
        effectBlock.sourcePresencePolicy,
        "source presence policy",
      ),
      causedBy: {
        type: "ruleProcess",
        name: "real-card:OP10-045-generated-support-test",
      },
    },
  ];

  const opened = processEffectRuntime(state);

  assert.equal(opened.errors, undefined);
  const decision = must(opened.state.pendingDecision, "trash decision");
  const openedP1 = must(opened.state.players[p1], "p1 after queue");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, p1);
  assert.deepEqual(decision.request, {
    timing: "onResolution",
    chooser: "self",
    player: "self",
    zone: "hand",
    min: 1,
    max: 1,
    allowFewerIfUnavailable: false,
    visibility: "privateToChooser",
  });
  assert.equal(openedP1.deck.length, beforeDeckSize - 2);
  assert.equal(openedP1.hand.length, beforeHandSize + 2);
  assert.deepEqual(
    openedP1.hand.slice(-2).map((card) => card.instanceId),
    [firstDrawn.instanceId, secondDrawn.instanceId],
  );
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    openedP1.hand.map((card) => card.instanceId),
  );
  const eventTypes = opened.events.map((event) => event.type);
  assert.equal(
    eventTypes.indexOf("cardDrawn") < eventTypes.indexOf("decisionCreated"),
    true,
  );

  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    playerId: p1,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: secondDrawn.instanceId,
          cardId: secondDrawn.cardId,
          playerId: p1,
          zone: must(
            openedP1.hand.find(
              (card) => card.instanceId === secondDrawn.instanceId,
            ),
            "drawn card in hand",
          ).zone,
        },
      ],
    },
  });
  const resolvedP1 = must(resolved.state.players[p1], "p1 after trash");

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    resolvedP1.hand.some((card) => card.instanceId === secondDrawn.instanceId),
    false,
  );
  assert.equal(resolvedP1.trash[0]?.instanceId, secondDrawn.instanceId);
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

const unsupportedRealCardFailClosedCases = [
  {
    cardId: "EB01-003",
    effectFamily: "rush",
  },
  {
    cardId: "EB01-006",
    effectFamily: "blocker",
  },
  {
    cardId: "EB01-008",
    effectFamily: "replacement",
  },
  {
    cardId: "EB01-010",
    effectFamily: "target-ko",
  },
  {
    cardId: "EB01-013",
    effectFamily: "activate-main",
  },
  {
    cardId: "EB01-019",
    effectFamily: "search-reveal",
  },
  {
    cardId: "EB01-028",
    effectFamily: "trigger",
  },
  {
    cardId: "EB01-036",
    effectFamily: "on-ko",
  },
  {
    cardId: "EB01-040",
    effectFamily: "target-ko",
  },
  {
    cardId: "EB01-051",
    effectFamily: "event-main",
  },
  {
    cardId: "EB02-018",
    effectFamily: "double-attack",
  },
  {
    cardId: "OP01-067",
    effectFamily: "banish-with-extra-text",
  },
  {
    cardId: "OP02-062",
    effectFamily: "when-attacking",
  },
] as const;

test("unsupported CARD-005 real fixture families fail closed through play-card and effect-definition gates", async () => {
  const plainManifest = await loadPlainRealCardManifest();
  const families = new Set(
    unsupportedRealCardFailClosedCases.map((entry) => entry.effectFamily),
  );

  assert.ok(families.size >= 8);

  for (const entry of unsupportedRealCardFailClosedCases) {
    const cardId = toCardId(entry.cardId);
    const manifestCard = must(
      plainManifest.cards[cardId],
      `${entry.cardId} manifest card`,
    );
    const state = setupMainPlayState();
    const p1State = must(state.players[p1], "p1");
    const handCard = must(p1State.hand[0], "hand card");
    handCard.cardId = cardId;
    state.cardManifest.cards = {
      ...state.cardManifest.cards,
      [cardId]: manifestCard,
    };
    state.cardManifest.effectDefinitions =
      plainManifest.effectDefinitions ?? {};
    const before = JSON.stringify(state);

    assert.equal(manifestCard.support.status, "unsupported");
    assert.equal(manifestCard.support.tested, false);
    assert.equal(manifestCard.support.effectDefinitionId, undefined);
    assert.equal(manifestCard.support.customHandlerIds, undefined);
    assert.equal(
      Object.values(plainManifest.effectDefinitions ?? {}).some(
        (definition) => definition.cardId === cardId,
      ),
      false,
    );

    assert.equal(
      getLegalActions(state, p1).some(
        (action) =>
          action.type === "playCard" &&
          action.cardInstanceId === handCard.instanceId,
      ),
      false,
      `${entry.cardId} ${entry.effectFamily} must not expose playCard`,
    );

    const played = applyPlayCard(state, {
      type: "playCard",
      cardInstanceId: handCard.instanceId,
    });
    assert.equal(played.errors?.[0]?.type, "illegalAction");
    assert.deepEqual(played.events, []);
    assert.equal(JSON.stringify(state), before);

    const lookup = resolveImplementedDslEffectDefinition(
      manifestCard,
      plainManifest,
    );
    if (lookup.ok) {
      assert.fail(`${entry.cardId} unexpectedly resolved an effect definition`);
    }
    if (lookup.error.type !== "effectRuntimeError") {
      assert.fail(`${entry.cardId} returned a non-runtime lookup error`);
    }
    assert.deepEqual(lookup.error.details, {
      reason: "unsupported-support-status",
      supportStatus: "unsupported",
    });
  }
});

test("unsupported CARD-005 real board fixtures fail closed at start-of-main and combat action gates", async () => {
  const plainManifest = await loadPlainRealCardManifest();
  const boardCases = unsupportedRealCardFailClosedCases.filter((entry) => {
    const card = plainManifest.cards[toCardId(entry.cardId)];

    return card?.category === "character" || card?.category === "leader";
  });

  assert.ok(boardCases.length >= 8);

  for (const entry of boardCases) {
    const cardId = toCardId(entry.cardId);
    const manifestCard = must(
      plainManifest.cards[cardId],
      `${entry.cardId} manifest card`,
    );
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const attacker = must(p1State.characters[0], "attacker");

    attacker.cardId = cardId;
    state.cardManifest.cards = {
      ...state.cardManifest.cards,
      [cardId]: manifestCard,
    };
    state.turn.phase = "don";
    const beforeMain = JSON.stringify(state);

    const main = enterMainPhase(state);
    assert.equal(main.errors?.[0]?.type, "effectRuntimeError");
    assert.deepEqual(main.events, []);
    assert.equal(JSON.stringify(state), beforeMain);

    state.turn.phase = "main";
    assert.equal(
      getLegalActions(state, p1).some(
        (action) =>
          action.type === "declareAttack" &&
          action.attacker.instanceId === attacker.instanceId,
      ),
      false,
      `${entry.cardId} ${entry.effectFamily} must not expose declareAttack`,
    );
  }
});
