import type {
  CardInstance,
  CausalityRef,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  OrderCardsDecision,
  SelectCardsDecision,
} from "@optcg/types";

import { appendEvent, toDecisionId } from "./action-results.js";
import { reindexZoneCards } from "./action-state.js";

type SearchEffect = Extract<Effect, { type: "search" }>;
type SearchRemainingCardsPolicyCarrier = {
  readonly remainingCards?: SearchEffect["request"]["remainingCards"];
};

export const hasSupportedDeckBottomRemainingCardsPolicy = (
  request: SearchRemainingCardsPolicyCarrier,
): boolean =>
  request.remainingCards !== undefined &&
  request.remainingCards.destination === "deck" &&
  request.remainingCards.position === "bottom" &&
  request.remainingCards.order === "ownerChoice";

export const isExactCharacterCategoryFilter = (
  filter: SearchEffect["request"]["filter"],
): boolean => {
  const keys = Object.keys(filter).sort();
  return (
    keys.length === 1 &&
    keys[0] === "categories" &&
    filter.categories !== undefined &&
    filter.categories.length === 1 &&
    filter.categories[0] === "character"
  );
};

export const hasSupportedTrashRemainingCardsPolicy = (
  request: SearchRemainingCardsPolicyCarrier,
): boolean =>
  request.remainingCards !== undefined &&
  request.remainingCards.destination === "trash";

export const hasSupportedRemainingCardsPolicy = (
  request: SearchRemainingCardsPolicyCarrier,
): boolean =>
  hasSupportedDeckBottomRemainingCardsPolicy(request) ||
  hasSupportedTrashRemainingCardsPolicy(request);

export const toDeckCard = (
  card: CardInstance,
  playerId: CardInstance["controller"],
  index: number,
): CardInstance => ({
  ...card,
  zone: { zone: "deck", playerId, slot: "deck", index },
});

export const toCardRefForPlayer = (
  card: CardInstance,
  playerId: CardInstance["controller"],
): SelectCardsDecision["candidates"][number]["card"] => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const toTrashCard = (
  card: CardInstance,
  playerId: CardInstance["controller"],
  index: number,
): CardInstance => ({
  ...card,
  zone: { zone: "trash", playerId, slot: "trash", index },
});

export const toTrashCards = (
  cards: readonly CardInstance[],
  playerId: CardInstance["controller"],
): CardInstance[] =>
  cards.map((card, index) => toTrashCard(card, playerId, index));

export const appendSearchRevealRemainderTrashEvents = (
  state: GameState,
  events: EngineEvent[],
  params: {
    readonly causedBy: CausalityRef;
    readonly originalCards: readonly CardInstance[];
    readonly playerId: EffectQueueEntry["controllerId"];
    readonly selectionSetId: string;
    readonly trashedCards: readonly CardInstance[];
  },
): void => {
  for (const [index, trashedCard] of params.trashedCards.entries()) {
    const originalCard = params.originalCards[index];
    appendEvent(
      state,
      events,
      "cardMoved",
      {
        instanceId: trashedCard.instanceId,
        cardId: trashedCard.cardId,
        from: originalCard?.zone,
        to: trashedCard.zone,
        reason: "searchRevealRemainder",
        selectionSetId: params.selectionSetId,
      },
      { type: "public" },
    );
    const cardMoved = events[events.length - 1];
    if (cardMoved !== undefined) {
      cardMoved.causedBy = params.causedBy;
    }
    appendEvent(
      state,
      events,
      "cardTrashed",
      {
        playerId: params.playerId,
        instanceId: trashedCard.instanceId,
        cardId: trashedCard.cardId,
        reason: "searchRevealRemainder",
      },
      { type: "public" },
    );
    const cardTrashed = events[events.length - 1];
    if (cardTrashed !== undefined) {
      cardTrashed.causedBy = params.causedBy;
    }
  }
};

export const deckAfterTrashingLookedCards = (
  playerId: EffectQueueEntry["controllerId"],
  cards: readonly CardInstance[],
): CardInstance[] => reindexZoneCards([...cards], "deck", playerId, "deck");

export const trashAfterTrashingLookedCards = (
  playerId: EffectQueueEntry["controllerId"],
  trashedCards: readonly CardInstance[],
  existingTrash: readonly CardInstance[],
): CardInstance[] =>
  reindexZoneCards(
    [...trashedCards, ...existingTrash],
    "trash",
    playerId,
    "trash",
  );

const orderDecisionIdForQueueEntryId = (queueEntryId: string) =>
  toDecisionId(`decision:orderCards:search-reveal:${queueEntryId}`);

export const createSearchRevealOrderCardsDecision = (
  queueEntryId: string,
  effectId: EffectQueueEntry["effectBlockId"],
  playerId: EffectQueueEntry["controllerId"],
  cards: readonly SelectCardsDecision["candidates"][number]["card"][],
): OrderCardsDecision => ({
  id: orderDecisionIdForQueueEntryId(queueEntryId),
  type: "orderCards",
  playerId,
  prompt: "Order the remaining looked cards.",
  causedBy: {
    type: "effect",
    queueEntryId: queueEntryId as EffectQueueEntry["id"],
    effectId,
  },
  visibility: { type: "private", playerId },
  cards: cards.map((card) => ({ ...card })),
  destination: "deck",
  defaultResponse: {
    type: "orderedIds",
    ids: cards.map((card) => String(card.instanceId)),
  },
});
