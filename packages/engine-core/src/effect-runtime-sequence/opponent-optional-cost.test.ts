import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
  PlayerId,
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

const opponentReturnDonDeclineSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "opponent-return-don",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "returnDon",
          count: 1,
          chooser: "opponent",
          sourceState: "active",
          optional: true,
        },
      },
    },
    {
      id: "draw-if-opponent-does-not",
      connector: "ifPreviousNotSucceeded",
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

const placeActiveDon = (
  state: GameState,
  playerId: PlayerId,
  count = 1,
): void => {
  const player = must(state.players[playerId], "player");
  const moved = player.donDeck.slice(0, count);
  assert.equal(moved.length, count);
  player.donDeck = player.donDeck.slice(count).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId, slot: "donDeck", index },
  }));
  player.costArea = [
    ...player.costArea,
    ...moved.map(
      (don, index): CardInstance => ({
        ...don,
        zone: { zone: "costArea", playerId, slot: "cost", index },
        state: "active",
      }),
    ),
  ];
};

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-opponent-optional-cost";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "opponent-optional-cost-rules",
      sourceTextHash: "opponent-optional-cost-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-opponent-optional-cost"),
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
      id: toQueueEntryId("queue-entry-opponent-optional-cost"),
      timingWindowId: toTimingWindowId("window-opponent-optional-cost"),
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
      causedBy: { type: "ruleProcess", name: "opponent-optional-cost-test" },
    },
  ];
  return state;
};

test("opponent optional return-DON cost asks the opponent and runs decline branch", () => {
  const state = sequenceQueueState(opponentReturnDonDeclineSequence());
  placeActiveDon(state, p2);
  const beforeP1 = must(state.players[p1], "before p1");
  const beforeDeckCount = beforeP1.deck.length;
  const beforeHandCount = beforeP1.hand.length;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "return DON decision");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "payCost");
  assert.equal(decision.playerId, p2);
  assert.equal(decision.cost.type, "returnDon");
  assert.equal(decision.cost.chooser, "opponent");
  assert.deepEqual(decision.paymentOptions, [
    { id: "returnDon", type: "returnDon", count: 1, sourceState: "active" },
  ]);

  const declined = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "paymentDeclined" },
  });
  const afterP1 = must(declined.state.players[p1], "after p1");
  assert.equal(declined.errors, undefined);
  assert.equal(declined.state.pendingDecision, undefined);
  assert.equal(afterP1.deck.length, beforeDeckCount - 1);
  assert.equal(afterP1.hand.length, beforeHandCount + 1);
});

test("opponent optional return-DON payment skips the decline branch", () => {
  const state = sequenceQueueState(opponentReturnDonDeclineSequence());
  placeActiveDon(state, p2);
  const beforeP1 = must(state.players[p1], "before p1");
  const beforeDeckCount = beforeP1.deck.length;
  const beforeHandCount = beforeP1.hand.length;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "return DON decision");
  const p2State = must(paused.state.players[p2], "p2");
  const don = must(p2State.costArea[0], "active DON");
  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "returnDon",
      selectedDonInstanceIds: [don.instanceId],
    },
  });
  const afterP1 = must(paid.state.players[p1], "after p1");
  const afterP2 = must(paid.state.players[p2], "after p2");

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision, undefined);
  assert.equal(afterP1.deck.length, beforeDeckCount);
  assert.equal(afterP1.hand.length, beforeHandCount);
  assert.equal(
    afterP2.donDeck.some((card) => card.instanceId === don.instanceId),
    true,
  );
});
