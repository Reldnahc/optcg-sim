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
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";
import { moveFieldToLifeCandidateCards } from "../runtime/costs/move-field-to-life.js";

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-field-to-life-cost-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "field-to-life-cost-rules",
      sourceTextHash: "field-to-life-cost-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-field-to-life-cost-sequence"),
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
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-field-to-life-cost-sequence"),
      timingWindowId: toTimingWindowId("window-field-to-life-cost-sequence"),
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
      causedBy: { type: "ruleProcess", name: "field-to-life-cost-test" },
    },
  ];
  return state;
};

const fieldToLifeCostThenOpponentTrashSequence = (): Effect => ({
  type: "sequence",
  effects: [
    {
      id: "field-to-life-cost",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "moveFieldToLife",
          count: 1,
          chooser: "self",
          player: "opponent",
          filter: { categories: ["character"], cost: { max: 3 } },
          position: "topOrBottom",
          faceUp: true,
          optional: true,
        },
      },
      saveResultAs: "paidOptionalCost",
    },
    {
      id: "opponent-trash-after-placement",
      connector: "ifYouDo",
      effect: {
        type: "trashFromHand",
        player: "opponent",
        chooser: "opponent",
        count: 1,
      },
    },
  ],
});

const payMoveFieldToLifeCost = (
  state: GameState,
  optionId: string,
  selectedCardId: CardInstance["instanceId"],
) => {
  const decision = must(state.pendingDecision, "pending decision");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId,
      selectedCardInstanceIds: [selectedCardId],
    },
  });
};

test("field-to-Life cost moves selected opponent Character before opponent hand trash", () => {
  const state = sequenceQueueState(fieldToLifeCostThenOpponentTrashSequence());
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    cost: 3,
    power: 3000,
  });

  const paused = processEffectRuntime(state);
  const paymentDecision = must(
    paused.state.pendingDecision,
    "field-to-life payment",
  );
  assert.equal(paused.errors, undefined);
  assert.equal(paymentDecision.type, "payCost");
  assert.equal(paymentDecision.cost.type, "moveFieldToLife");
  assert.deepEqual(
    paymentDecision.paymentOptions.map((option) => option.id),
    ["moveFieldToLife:top", "moveFieldToLife:bottom"],
  );

  const paid = payMoveFieldToLifeCost(
    paused.state,
    "moveFieldToLife:top",
    target.instanceId,
  );
  const trashDecision = must(paid.state.pendingDecision, "opponent hand trash");
  const afterPaidP2 = must(paid.state.players[p2], "p2 after payment");
  const topLife = must(afterPaidP2.life[0], "top Life");

  assert.equal(paid.errors, undefined);
  assert.equal(
    afterPaidP2.characters.some(
      (card) => card.instanceId === target.instanceId,
    ),
    false,
  );
  assert.equal(topLife.card.instanceId, target.instanceId);
  assert.equal(topLife.faceUp, true);
  assert.equal(trashDecision.type, "selectCards");
  assert.equal(trashDecision.playerId, p2);
});

test("field-to-Life cost candidates support current power filters", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2");
  const lowPower = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "low power target"),
    zone: "characterArea",
  });
  const highPower = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[1], "high power target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[lowPower.cardId] = resolvedCard({
    cardId: lowPower.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[highPower.cardId] = resolvedCard({
    cardId: highPower.cardId,
    category: "character",
    power: 7000,
  });

  const candidates = moveFieldToLifeCandidateCards(state, p1, {
    id: "moveFieldToLife:top",
    type: "moveFieldToLife",
    count: 1,
    player: "opponent",
    filter: { categories: ["character"], currentPower: { min: 7000 } },
    position: "top",
    faceUp: true,
  });

  assert.deepEqual(
    candidates.map((card) => card.instanceId),
    [highPower.instanceId],
  );
});
