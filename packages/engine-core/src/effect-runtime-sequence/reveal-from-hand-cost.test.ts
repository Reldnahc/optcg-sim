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
} from "../effect-runtime-queue/test-support.js";

const reindexHand = (
  cards: readonly CardInstance[],
  playerId = p1,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId, slot: "hand", index },
  }));

const revealFromHandThenDrawSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-reveal-from-hand",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "revealFromHand",
          count: 1,
          chooser: "self",
          optional: true,
          filter: {
            categories: ["character"],
            power: { op: "eq", value: 8000 },
          },
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
  const effectDefinitionId = "def-reveal-from-hand-cost";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "reveal-from-hand-cost-rules",
      sourceTextHash: "reveal-from-hand-cost-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-reveal-from-hand-cost"),
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

const sequenceQueueState = (): GameState => {
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
  const secondDrawCard = must(
    remainingHand[remainingHand.length - 1],
    "deck refill",
  );
  p1State.hand = reindexHand(remainingHand.slice(0, -1));
  p1State.deck = [
    ...p1State.deck,
    {
      ...secondDrawCard,
      zone: {
        zone: "deck",
        playerId: p1,
        slot: "deck",
        index: p1State.deck.length,
      },
    },
  ];
  const definition = setupSequenceDefinition(
    state,
    source,
    revealFromHandThenDrawSequence(),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-reveal-from-hand-cost"),
      timingWindowId: toTimingWindowId("window-reveal-from-hand-cost"),
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
      causedBy: { type: "ruleProcess", name: "reveal-from-hand-cost-test" },
    },
  ];
  return state;
};

const payRevealFromHandWithCard = (state: GameState, card: CardInstance) => {
  const decision = must(state.pendingDecision, "pending decision");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "revealFromHand",
      selectedCardInstanceIds: [card.instanceId],
    },
  });
};

test("optional reveal-from-hand cost reveals filtered hand cards without moving them before dependent effects", () => {
  const state = sequenceQueueState();
  const beforeP1 = must(state.players[p1], "before p1");
  const eligible = must(beforeP1.hand[0], "eligible reveal card");
  const ineligible = must(beforeP1.hand[1], "ineligible reveal card");
  eligible.cardId = toCardId("eligible-8000-character");
  ineligible.cardId = toCardId("ineligible-7000-character");
  state.cardManifest.cards[eligible.cardId] = resolvedCard({
    cardId: eligible.cardId,
    category: "character",
    power: 8000,
  });
  state.cardManifest.cards[ineligible.cardId] = resolvedCard({
    cardId: ineligible.cardId,
    category: "character",
    power: 7000,
  });
  const beforeDeckCount = beforeP1.deck.length;
  const beforeHandCount = beforeP1.hand.length;

  const revealPaused = processEffectRuntime(state);
  const revealDecision = must(
    revealPaused.state.pendingDecision,
    "reveal-from-hand decision",
  );
  const rejectedIneligible = payRevealFromHandWithCard(
    revealPaused.state,
    ineligible,
  );
  const paidReveal = payRevealFromHandWithCard(revealPaused.state, eligible);
  const afterP1 = must(paidReveal.state.players[p1], "after p1");
  const revealEvent = must(
    paidReveal.events.find((event) => event.type === "cardRevealed"),
    "reveal event",
  );

  assert.equal(revealPaused.errors, undefined);
  assert.equal(revealDecision.type, "payCost");
  assert.equal(revealDecision.cost.type, "revealFromHand");
  assert.equal(rejectedIneligible.errors?.[0]?.type, "invalidDecisionResponse");
  assert.equal(paidReveal.errors, undefined);
  assert.equal(paidReveal.state.pendingDecision, undefined);
  assert.deepEqual(revealEvent.payload, {
    revealId: `reveal:reveal-from-hand:${String(revealDecision.id)}`,
    cards: [
      {
        instanceId: eligible.instanceId,
        cardId: eligible.cardId,
        playerId: p1,
        zone: eligible.zone,
      },
    ],
    origin: "hand",
    reason: "revealFromHandCost",
  });
  assert.equal(
    afterP1.hand.some((card) => card.instanceId === eligible.instanceId),
    true,
  );
  assert.equal(afterP1.deck.length, beforeDeckCount - 1);
  assert.equal(afterP1.hand.length, beforeHandCount + 1);
});
