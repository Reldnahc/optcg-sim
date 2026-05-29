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
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";

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
          filter: { categories: ["character"], power: { max: 0 } },
        },
      },
    },
  ],
});

test("all-target K.O. sequence filters against current computed power", () => {
  const state = sequenceQueueState(
    reduceOpponentPowerThenKoZeroPowerSequence(),
  );
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
});
