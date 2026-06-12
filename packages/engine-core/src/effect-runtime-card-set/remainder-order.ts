import type {
  CardInstance,
  CardRef,
  EffectQueueEntry,
  GameState,
  OrderCardsDecision,
  PlayerId,
} from "@optcg/types";

import { toDecisionId } from "../action-results.js";
import { reindexZoneCards, zonesEqual } from "../actions/state.js";

export const orderedIdsFromResponse = (
  responseIds: unknown,
  expectedIds: readonly string[],
): string[] | null => {
  if (
    !Array.isArray(responseIds) ||
    !responseIds.every((id) => typeof id === "string")
  ) {
    return null;
  }
  const seen = new Set<string>();
  for (const id of responseIds) {
    if (seen.has(id)) {
      return null;
    }
    seen.add(id);
  }
  return responseIds.length === expectedIds.length &&
    responseIds.every((id) => expectedIds.includes(id))
    ? responseIds
    : null;
};

export const activeDeckCardsForOrder = (
  state: GameState,
  playerId: PlayerId,
  cards: readonly CardRef[],
): CardInstance[] | null => {
  const player = state.players[playerId];
  if (player === undefined) {
    return null;
  }
  const activeDeckCards = player.deck.slice(0, cards.length);
  if (
    activeDeckCards.length !== cards.length ||
    !cards.every((card, index) => {
      const deckCard = activeDeckCards[index];
      return (
        deckCard !== undefined &&
        card.instanceId === deckCard.instanceId &&
        card.cardId === deckCard.cardId &&
        card.zone !== undefined &&
        zonesEqual(card.zone, deckCard.zone)
      );
    })
  ) {
    return null;
  }
  return activeDeckCards;
};

export const orderedDeckCardsFromIds = (
  activeDeckCards: readonly CardInstance[],
  orderedIds: readonly string[],
): CardInstance[] =>
  orderedIds.flatMap((id) => {
    const card = activeDeckCards.find(
      (candidate) => String(candidate.instanceId) === id,
    );
    return card === undefined ? [] : [card];
  });

export const placeOrderedCardsOnDeck = (
  state: GameState,
  playerId: PlayerId,
  orderedCards: readonly CardInstance[],
  position: "top" | "bottom",
): GameState | null => {
  const player = state.players[playerId];
  if (player === undefined) {
    return null;
  }
  const orderedIds = new Set(
    orderedCards.map((card) => String(card.instanceId)),
  );
  const remainingDeck = player.deck.filter(
    (card) => !orderedIds.has(String(card.instanceId)),
  );
  const nextDeck = reindexZoneCards(
    position === "top"
      ? [...orderedCards, ...remainingDeck]
      : [...remainingDeck, ...orderedCards],
    "deck",
    playerId,
    "deck",
  );
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, deck: nextDeck },
    },
  };
};

export const createRemainingCardsOrderDecision = (params: {
  cards: readonly CardRef[];
  decisionId: string;
  effectId: EffectQueueEntry["effectBlockId"];
  placement?: OrderCardsDecision["placement"];
  playerId: PlayerId;
  queueEntryId: EffectQueueEntry["id"];
}): OrderCardsDecision => ({
  id: toDecisionId(params.decisionId),
  type: "orderCards",
  playerId: params.playerId,
  prompt: "Order the remaining looked cards.",
  causedBy: {
    type: "effect",
    queueEntryId: params.queueEntryId,
    effectId: params.effectId,
  },
  visibility: { type: "private", playerId: params.playerId },
  cards: params.cards.map((card) => ({ ...card })),
  destination: "deck",
  ...(params.placement === undefined ? {} : { placement: params.placement }),
  ...(params.placement === undefined
    ? {
        defaultResponse: {
          type: "orderedIds" as const,
          ids: params.cards.map((card) => String(card.instanceId)),
        },
      }
    : {}),
});
