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

import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import { createRemainingCardsOrderDecision } from "../effect-runtime-card-set/remainder-order.js";

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

export const moveSearchRevealRemainderToTrash = (
  state: GameState,
  events: EngineEvent[],
  params: {
    readonly causedBy: CausalityRef;
    readonly cards: readonly CardInstance[];
    readonly playerId: EffectQueueEntry["controllerId"];
    readonly selectionSetId: string;
  },
): { movedCards: CardInstance[]; state: GameState } =>
  moveConcreteCardsToTrash(state, events, params.cards, {
    cardMovedPayloadExtra: { selectionSetId: params.selectionSetId },
    cardMovedPayloadShape: "zoneRefs",
    cardMovedVisibility: { type: "public" },
    cardTrashedVisibility: { type: "public" },
    causedBy: params.causedBy,
    emitCardTrashed: true,
    includeCardIdentityInCardMoved: true,
    playerId: params.playerId,
    reason: "searchRevealRemainder",
    sourceZone: "deck",
  });

const orderDecisionIdForQueueEntryId = (queueEntryId: string) =>
  `decision:orderCards:search-reveal:${queueEntryId}`;

export const createSearchRevealOrderCardsDecision = (
  queueEntryId: string,
  effectId: EffectQueueEntry["effectBlockId"],
  playerId: EffectQueueEntry["controllerId"],
  cards: readonly SelectCardsDecision["candidates"][number]["card"][],
): OrderCardsDecision =>
  createRemainingCardsOrderDecision({
    cards,
    decisionId: orderDecisionIdForQueueEntryId(queueEntryId),
    effectId,
    playerId,
    queueEntryId: queueEntryId as EffectQueueEntry["id"],
  });
