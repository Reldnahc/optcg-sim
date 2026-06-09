import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupOnKODefinition,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-all-target-ko-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "all-target-ko-sequence-rules",
      sourceTextHash: "all-target-ko-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-all-target-ko-sequence"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const sequenceQueueState = (effect: Effect): GameState => {
  const state = createActiveState();
  state.cardManifest.cards[toCardId("leader-red")] = resolvedCard({
    cardId: toCardId("leader-red"),
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[toCardId("leader-blue")] = resolvedCard({
    cardId: toCardId("leader-blue"),
    category: "leader",
    power: 5000,
  });
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-all-target-ko-sequence"),
      timingWindowId: toTimingWindowId("window-all-target-ko-sequence"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "all-target-ko-sequence-test" },
    },
  ];
  return state;
};

const reduceOpponentPowerThenKoZeroPowerSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "turn-life-face-up",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "turnLifeFaceUp",
          count: 1,
          player: "self",
          position: "top",
          optional: true,
        },
      },
    },
    {
      id: "reduce-all-opponent-characters",
      connector: "ifYouDo",
      effect: {
        type: "modifyPower",
        target: {
          type: "all",
          zone: "characterArea",
          player: "opponent",
          filter: { categories: ["character"] },
        },
        value: -2000,
        duration: { type: "thisTurn" },
      },
    },
    {
      id: "ko-zero-power-opponent-characters",
      connector: "then",
      effect: {
        type: "ko",
        target: {
          type: "all",
          zone: "characterArea",
          player: "opponent",
          filter: { categories: ["character"], currentPower: { max: 0 } },
        },
      },
    },
  ],
});

const optionalCostThenNestedReduceOpponentPowerThenKoZeroPowerSequence =
  (): Extract<Effect, { type: "sequence" }> => ({
    type: "sequence",
    effects: [
      {
        id: "turn-life-face-up",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: {
            type: "turnLifeFaceUp",
            count: 1,
            player: "self",
            position: "top",
            optional: true,
          },
        },
      },
      {
        id: "body:after-cost",
        connector: "ifYouDo",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: {
                  type: "all",
                  zone: "characterArea",
                  player: "opponent",
                  filter: { categories: ["character"] },
                },
                value: -2000,
                duration: { type: "thisTurn" },
              },
            },
            {
              connector: "then",
              effect: {
                type: "ko",
                target: {
                  type: "all",
                  zone: "characterArea",
                  player: "opponent",
                  filter: {
                    categories: ["character"],
                    currentPower: { max: 0 },
                  },
                },
              },
            },
          ],
        },
      },
    ],
  });

const assertZeroPowerKoAfterLifeFaceUpCost = (effect: Effect): void => {
  const state = sequenceQueueState(effect);
  const p2State = must(state.players[p2], "p2");
  const koTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "zero after modifier target"),
    zone: "characterArea",
    index: 0,
  });
  const survivor = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[1], "positive after modifier target"),
    zone: "characterArea",
    index: 1,
  });
  state.cardManifest.cards[koTarget.cardId] = resolvedCard({
    cardId: koTarget.cardId,
    category: "character",
    power: 2000,
  });
  state.cardManifest.cards[survivor.cardId] = resolvedCard({
    cardId: survivor.cardId,
    category: "character",
    power: 3000,
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pay cost decision");
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "turnLifeFaceUp");
  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "turnLifeFaceUp:top",
    },
  });
  const nextP2 = must(result.state.players[p2], "p2");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === koTarget.instanceId),
    false,
  );
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === survivor.instanceId),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === koTarget.instanceId),
    true,
  );
  assert.equal(
    result.events.filter((event) => event.type === "cardKOd").length,
    1,
  );
};

test("all-target K.O. sequence filters against current computed power", () => {
  assertZeroPowerKoAfterLifeFaceUpCost(
    reduceOpponentPowerThenKoZeroPowerSequence(),
  );
});

test("optional-cost nested all-target K.O. sequence filters against current computed power", () => {
  assertZeroPowerKoAfterLifeFaceUpCost(
    optionalCostThenNestedReduceOpponentPowerThenKoZeroPowerSequence(),
  );
});

test("all-target K.O. excludes the source card when filter requests excludeSelf", () => {
  const state = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        id: "turn-life-face-up",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: {
            type: "turnLifeFaceUp",
            count: 1,
            player: "self",
            position: "top",
            optional: true,
          },
        },
      },
      {
        id: "ko-after-cost",
        connector: "ifYouDo",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "ko",
                target: {
                  type: "all",
                  zone: "characterArea",
                  player: "self",
                  filter: { categories: ["character"], excludeSelf: true },
                },
              },
            },
            {
              connector: "then",
              effect: {
                type: "ko",
                target: {
                  type: "all",
                  zone: "characterArea",
                  player: "opponent",
                  filter: { categories: ["character"], excludeSelf: true },
                },
              },
            },
          ],
        },
      },
    ],
  });
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.characters[0], "source character");
  const selfTarget = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[1], "self target"),
    zone: "characterArea",
    index: 1,
  });
  const opponentTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "opponent target"),
    zone: "characterArea",
    index: 0,
  });
  const sourceSupportCard = must(
    state.cardManifest.cards[source.cardId],
    "source support card",
  );
  state.cardManifest.cards[source.cardId] = {
    ...sourceSupportCard,
    category: "character",
    power: 5000,
  };
  for (const card of [selfTarget, opponentTarget]) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      power: 5000,
    });
  }

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const decision = must(paused.state.pendingDecision, "pay cost decision");
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "turnLifeFaceUp");

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "turnLifeFaceUp:top",
    },
  });
  const nextP1 = must(result.state.players[p1], "p1 result");
  const nextP2 = must(result.state.players[p2], "p2 result");

  assert.equal(result.errors, undefined);
  assert.equal(
    nextP1.characters.some((card) => card.instanceId === source.instanceId),
    true,
  );
  assert.equal(
    nextP1.trash.some((card) => card.instanceId === selfTarget.instanceId),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === opponentTarget.instanceId),
    true,
  );
});

test("generic effect decision continuation resolves nested On K.O. triggers", () => {
  const state = sequenceQueueState(
    optionalCostThenNestedReduceOpponentPowerThenKoZeroPowerSequence(),
  );
  const p2State = must(state.players[p2], "p2");
  const koTarget = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(p2State.hand[0], "zero after modifier target"),
      cardId: toCardId("nested-on-ko-target"),
    },
    zone: "characterArea",
    index: 0,
  });
  const survivor = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(p2State.hand[1], "positive after modifier target"),
      cardId: toCardId("nested-on-ko-survivor"),
    },
    zone: "characterArea",
    index: 1,
  });
  p2State.hand = p2State.hand
    .filter(
      (card) =>
        card.instanceId !== koTarget.instanceId &&
        card.instanceId !== survivor.instanceId,
    )
    .map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p2, slot: "hand", index },
    }));
  const onKODefinition = setupOnKODefinition(
    state,
    koTarget,
    "def-on-ko-after-all-target-ko",
  );
  const koTargetCard = must(
    state.cardManifest.cards[koTarget.cardId],
    "K.O. target support card",
  );
  state.cardManifest.cards[koTarget.cardId] = {
    ...koTargetCard,
    power: 2000,
  };
  state.cardManifest.cards[survivor.cardId] = resolvedCard({
    cardId: survivor.cardId,
    category: "character",
    power: 3000,
  });
  const p2HandBefore = p2State.hand.length;
  const p2DeckBefore = p2State.deck.length;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pay cost decision");
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "turnLifeFaceUp");
  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "turnLifeFaceUp:top",
    },
  });
  const nextP2 = must(result.state.players[p2], "p2 result");
  const onKOEffect = must(onKODefinition.effects[0], "On K.O. effect");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.equal(nextP2.hand.length, p2HandBefore + 1);
  assert.equal(nextP2.deck.length, p2DeckBefore - 1);
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === koTarget.instanceId),
    true,
  );
  assert.equal(
    result.events.some((event) => {
      if (event.type !== "effectResolved") {
        return false;
      }
      const payload = event.payload as { effectBlockId?: unknown };
      return payload.effectBlockId === onKOEffect.id;
    }),
    true,
  );
});
