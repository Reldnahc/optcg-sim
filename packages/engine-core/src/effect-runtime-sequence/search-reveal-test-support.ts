import assert from "node:assert/strict";

import type {
  CardInstance,
  CardRef,
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
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-search-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "search-sequence-rules",
      sourceTextHash: "search-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-search-sequence"),
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

export const sequenceQueueState = (
  effect: Effect,
  minimumDeckCount: number,
): { state: GameState; definition: EffectDefinition } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  player.hand = reindexHand(player.hand.slice(1));
  while (player.deck.length < minimumDeckCount) {
    const refill = must(player.hand.at(-1), "deck refill");
    player.hand = reindexHand(player.hand.slice(0, -1));
    player.deck = [
      ...player.deck,
      {
        ...refill,
        zone: {
          zone: "deck",
          playerId: p1,
          slot: "deck",
          index: player.deck.length,
        },
      },
    ];
  }
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-search-sequence"),
      timingWindowId: toTimingWindowId("window-search-sequence"),
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
      causedBy: { type: "ruleProcess", name: "search-sequence-test" },
    },
  ];
  return { state, definition };
};

export const respondWithCards = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  const selected = must(decision.candidates[0], "search candidate").card;
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected] },
  });
};

export const respondWithNoCards = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [] },
  });
};

export const respondWithOrderedIds = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  assert.equal(decision.type, "orderCards");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "orderedIds",
      ids: decision.cards.map((card) => String(card.instanceId)),
    },
  });
};

export const markTopDeckAsSearchCandidates = (
  state: GameState,
  count: number,
): readonly CardInstance[] => {
  const player = must(state.players[p1], "p1");
  const cards = player.deck.slice(0, count);
  assert.equal(cards.length, count);
  for (const card of cards) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "event",
    });
  }
  return cards;
};

export const isCardRevealedPayload = (
  payload: unknown,
): payload is { readonly cards: readonly CardRef[] } =>
  typeof payload === "object" &&
  payload !== null &&
  "cards" in payload &&
  Array.isArray(payload.cards);
