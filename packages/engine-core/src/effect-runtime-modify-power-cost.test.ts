import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EngineResult,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";

const reindexHand = (
  cards: readonly CardInstance[],
  playerId = p1,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId, slot: "hand", index },
  }));

const activeLeaderPowerCostThenDrawSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-active-leader-power-cost",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "modifyPower",
          target: { type: "myLeader" },
          requiredState: "active",
          value: -5000,
          duration: { type: "thisTurn" },
          optional: true,
        },
      },
      saveResultAs: "paidOptionalCost",
    },
    {
      id: "draw-if-paid",
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-active-leader-power-cost";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "active-leader-power-cost-rules",
      sourceTextHash: "active-leader-power-cost-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-active-leader-power-cost"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const sequenceQueueState = (effect: Effect): GameState => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const remainingHand = p1State.hand.slice(1);
  const drawCard = must(remainingHand.at(-1), "deck refill");
  p1State.hand = reindexHand(remainingHand.slice(0, -1));
  p1State.deck = [
    ...p1State.deck,
    {
      ...drawCard,
      zone: {
        zone: "deck",
        playerId: p1,
        slot: "deck",
        index: p1State.deck.length,
      },
    },
  ];
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-active-leader-power-cost"),
      timingWindowId: toTimingWindowId("window-active-leader-power-cost"),
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
      causedBy: { type: "ruleProcess", name: "active-leader-power-cost-test" },
    },
  ];
  return state;
};

const payLeaderPowerCost = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "modifyPower:myLeader",
    },
  });
};

test("active leader power cost materializes power loss before dependent draw", () => {
  const state = sequenceQueueState(activeLeaderPowerCostThenDrawSequence());
  const beforeP1 = must(state.players[p1], "before p1");
  beforeP1.leader.state = "active";
  const beforeDeckCount = beforeP1.deck.length;
  const beforeHandCount = beforeP1.hand.length;

  const costPaused = processEffectRuntime(state);
  const decision = must(costPaused.state.pendingDecision, "pay cost decision");
  const paidCost = payLeaderPowerCost(costPaused.state);
  const afterP1 = must(paidCost.state.players[p1], "after p1");
  const powerRecord = must(
    paidCost.state.continuousEffects[0],
    "leader power cost record",
  );

  assert.equal(costPaused.errors, undefined);
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "modifyPower");
  assert.deepEqual(decision.paymentOptions, [
    {
      id: "modifyPower:myLeader",
      type: "modifyPower",
      target: { type: "myLeader" },
      requiredState: "active",
      value: -5000,
      duration: { type: "thisTurn" },
    },
  ]);
  assert.equal(paidCost.errors, undefined);
  assert.equal(paidCost.state.pendingDecision, undefined);
  assert.equal(afterP1.deck.length, beforeDeckCount - 1);
  assert.equal(afterP1.hand.length, beforeHandCount + 1);
  assert.equal(powerRecord.modifier.layer, "powerAdd");
  assert.equal(powerRecord.modifier.operation.type, "addPower");
  assert.equal(powerRecord.modifier.operation.value, -5000);
  assert.equal(powerRecord.modifier.target.type, "exactCard");
  assert.equal(
    powerRecord.modifier.target.card.instanceId,
    afterP1.leader.instanceId,
  );
});

test("rested leader cannot pay active leader power cost and dependent draw is skipped", () => {
  const state = sequenceQueueState(activeLeaderPowerCostThenDrawSequence());
  const beforeP1 = must(state.players[p1], "before p1");
  beforeP1.leader.state = "rested";
  const beforeDeckCount = beforeP1.deck.length;
  const beforeHandCount = beforeP1.hand.length;

  const result = processEffectRuntime(state);
  const afterP1 = must(result.state.players[p1], "after p1");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(afterP1.deck.length, beforeDeckCount);
  assert.equal(afterP1.hand.length, beforeHandCount);
  assert.equal(result.state.continuousEffects.length, 0);
});
