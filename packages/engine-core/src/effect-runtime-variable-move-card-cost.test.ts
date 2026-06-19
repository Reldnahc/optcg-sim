import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, Effect, EffectDefinition } from "@optcg/types";

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

const variableCharacterReturnThenPowerSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "variable-return-to-owner-hand-cost",
      connector: "always",
      saveResultAs: "paidCost:returnToOwnerHand",
      effect: {
        type: "payCost",
        cost: {
          type: "moveCards",
          count: 0,
          maxCount: "available",
          chooser: "self",
          from: { player: "self", zone: "characterArea" },
          to: { player: "self", zone: "hand" },
          order: "chooserChoice",
          filter: { categories: ["character"] },
          optional: true,
        },
      },
    },
    {
      id: "power-for-returned-characters",
      connector: "ifYouDo",
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: {
          type: "paidCostCardCount",
          cost: "paidCost:returnToOwnerHand",
          multiplier: 2000,
        },
        duration: { type: "thisBattle" },
      },
    },
  ],
});

const setupSequenceDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-variable-move-cost",
      rulesVersion: "variable-move-cost-rules",
      sourceTextHash: "variable-move-cost-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  state.cardManifest.cards[source.cardId] = supportCard;
  return {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-variable-move-cost"),
        effect,
      },
    ],
  };
};

test("variable move-card cost records returned field cards for dynamic power values", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
    index: 0,
  });
  const firstReturned = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[1], "first returned"),
    zone: "characterArea",
    index: 1,
  });
  const secondReturned = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[2], "second returned"),
    zone: "characterArea",
    index: 2,
  });
  p1State.hand = p1State.hand.slice(3);
  for (const card of [source, firstReturned, secondReturned]) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      power: 1000,
    });
  }
  const definition = setupSequenceDefinition(
    state,
    source,
    variableCharacterReturnThenPowerSequence(),
  );
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-variable-move-cost": definition,
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-variable-move-cost"),
      timingWindowId: toTimingWindowId("window-variable-move-cost"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "variable-move-cost-test" },
    },
  ];

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const paymentDecision = must(paused.state.pendingDecision, "pay cost");
  assert.equal(paymentDecision.type, "payCost");
  assert.deepEqual(paymentDecision.paymentOptions, [
    {
      id: "moveCards",
      type: "moveCards",
      count: 0,
      maxCount: "available",
      from: { player: "self", zone: "characterArea" },
      to: { player: "self", zone: "hand" },
      filter: { categories: ["character"] },
    },
  ]);

  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: paymentDecision.id,
    response: {
      type: "payment",
      optionId: "moveCards",
      selectedCardInstanceIds: [
        firstReturned.instanceId,
        secondReturned.instanceId,
      ],
    },
  });

  const afterP1 = must(paid.state.players[p1], "after p1");
  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision, undefined);
  assert.equal(paid.state.effectExecutionFrames.length, 0);
  assert.equal(
    afterP1.characters.some((card) => card.instanceId === source.instanceId),
    true,
  );
  assert.equal(
    afterP1.hand.some((card) => card.instanceId === firstReturned.instanceId),
    true,
  );
  assert.equal(
    afterP1.hand.some((card) => card.instanceId === secondReturned.instanceId),
    true,
  );
  assert.deepEqual(
    paid.state.continuousEffects.map((effect) => effect.modifier),
    [
      {
        layer: "powerAdd",
        target: { type: "self" },
        operation: { type: "addPower", value: 4000 },
      },
    ],
  );
  assert.equal(paid.stateHash, hashCanonicalStateValue(paid.state));
});
