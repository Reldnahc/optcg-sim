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
  hashCanonicalStateValue,
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
} from "./effect-runtime-queue/test-support.js";

const variableRestDonThenPowerSequence = (): Extract<
  Effect,
  { type: "sequence" }
> =>
  ({
    type: "sequence",
    effects: [
      {
        id: "variable-rest-don-cost",
        connector: "always",
        saveResultAs: "paidCost:restDon",
        effect: {
          type: "payCost",
          cost: {
            type: "restDon",
            count: 0,
            maxCount: "available",
            chooser: "self",
            optional: true,
          },
        },
      },
      {
        id: "power-for-paid-don",
        connector: "ifYouDo",
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: {
            type: "paidCostCardCount",
            cost: "paidCost:restDon",
            multiplier: 1000,
          },
          duration: { type: "thisBattle" },
        },
      },
    ],
  }) as unknown as Extract<Effect, { type: "sequence" }>;

const variableReturnDonThenDrawSequence = (): Extract<
  Effect,
  { type: "sequence" }
> =>
  ({
    type: "sequence",
    effects: [
      {
        id: "variable-return-don-cost",
        connector: "always",
        saveResultAs: "paidCost:returnDon",
        effect: {
          type: "payCost",
          cost: {
            type: "returnDon",
            count: 1,
            maxCount: "available",
            optional: true,
          },
        },
      },
      {
        id: "draw-after-return",
        connector: "ifYouDo",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  }) as unknown as Extract<Effect, { type: "sequence" }>;

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-variable-rest-don-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "variable-rest-don-sequence-rules",
      sourceTextHash: "variable-rest-don-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      { ...baseEffect, id: toEffectId("effect-variable-rest-don"), effect },
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
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const remainingHand = p1State.hand.slice(1);
  p1State.hand = remainingHand.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-variable-rest-don"),
      timingWindowId: toTimingWindowId("window-variable-rest-don"),
      controllerId: p1,
      effectBlockId: toEffectId("effect-variable-rest-don"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "variable-rest-don-test" },
    },
  ];
  return state;
};

const placeActiveDon = (state: GameState, playerId = p1): CardInstance => {
  const player = must(state.players[playerId], "player");
  const don = must(player.donDeck[0], "DON");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId, slot: "donDeck", index },
  }));
  const activeDon: CardInstance = {
    ...don,
    zone: {
      zone: "costArea",
      playerId,
      slot: "cost",
      index: player.costArea.length,
    },
    state: "active",
  };
  player.costArea = [...player.costArea, activeDon];
  return activeDon;
};

test("variable rest-DON cost records selected paid DON for dynamic power values", () => {
  const state = sequenceQueueState(variableRestDonThenPowerSequence());
  const firstDon = placeActiveDon(state);
  const secondDon = placeActiveDon(state);
  const thirdDon = placeActiveDon(state);

  const paused = processEffectRuntime(state);
  const paymentDecision = must(paused.state.pendingDecision, "pay cost");
  assert.equal(paymentDecision.type, "payCost");
  assert.deepEqual(paymentDecision.paymentOptions, [
    { id: "restDon", type: "restDon", count: 0, maxCount: "available" },
  ]);

  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: paymentDecision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [firstDon.instanceId, secondDon.instanceId],
    },
  });
  const afterP1 = must(paid.state.players[p1], "after p1");

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision, undefined);
  assert.equal(paid.state.effectExecutionFrames.length, 0);
  assert.equal(
    must(
      afterP1.costArea.find((card) => card.instanceId === firstDon.instanceId),
      "first paid DON",
    ).state,
    "rested",
  );
  assert.equal(
    must(
      afterP1.costArea.find((card) => card.instanceId === secondDon.instanceId),
      "second paid DON",
    ).state,
    "rested",
  );
  assert.equal(
    must(
      afterP1.costArea.find((card) => card.instanceId === thirdDon.instanceId),
      "unpaid DON",
    ).state,
    "active",
  );
  assert.deepEqual(
    paid.state.continuousEffects.map((effect) => effect.modifier),
    [
      {
        layer: "powerAdd",
        target: { type: "self" },
        operation: { type: "addPower", value: 2000 },
      },
    ],
  );
  assert.equal(paid.stateHash, hashCanonicalStateValue(paid.state));
});

test("variable return-DON cost accepts one or more selected DON payments", () => {
  const state = sequenceQueueState(variableReturnDonThenDrawSequence());
  const firstDon = placeActiveDon(state);
  const secondDon = placeActiveDon(state);
  const thirdDon = placeActiveDon(state);

  const paused = processEffectRuntime(state);
  const paymentDecision = must(paused.state.pendingDecision, "pay cost");
  assert.equal(paymentDecision.type, "payCost");
  assert.deepEqual(paymentDecision.paymentOptions, [
    { id: "returnDon", type: "returnDon", count: 1, maxCount: "available" },
  ]);

  const rejectedZero = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: paymentDecision.id,
    response: {
      type: "payment",
      optionId: "returnDon",
      selectedDonInstanceIds: [],
    },
  });
  assert.equal(
    must(rejectedZero.errors, "zero selected errors")[0]?.type,
    "invalidDecisionResponse",
  );

  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: paymentDecision.id,
    response: {
      type: "payment",
      optionId: "returnDon",
      selectedDonInstanceIds: [firstDon.instanceId, secondDon.instanceId],
    },
  });
  const afterP1 = must(paid.state.players[p1], "after p1");

  assert.equal(paid.errors, undefined);
  assert.equal(
    afterP1.costArea.some((card) => card.instanceId === firstDon.instanceId),
    false,
  );
  assert.equal(
    afterP1.costArea.some((card) => card.instanceId === secondDon.instanceId),
    false,
  );
  assert.equal(
    afterP1.costArea.some((card) => card.instanceId === thirdDon.instanceId),
    true,
  );
  assert.equal(afterP1.donDeck.at(-2)?.instanceId, firstDon.instanceId);
  assert.equal(afterP1.donDeck.at(-1)?.instanceId, secondDon.instanceId);
  assert.equal(paid.stateHash, hashCanonicalStateValue(paid.state));
});
