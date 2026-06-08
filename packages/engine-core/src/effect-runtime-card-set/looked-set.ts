import type {
  CardRef,
  EffectQueueEntry,
  GameState,
  PlayerId,
  SelectCardsDecision,
} from "@optcg/types";

import { toDecisionId } from "../action-results.js";
import { zonesEqual } from "../actions/state.js";

export type PrivateTopDeckLookSet = {
  id: string;
  cards: CardRef[];
  origin: "topOfDeck";
  ownerId: PlayerId;
  controllerId: PlayerId;
  visibility: { type: "private"; playerId: PlayerId };
  cleanupPolicy: "returnToOrigin";
};

type TopDeckLookSetLike = {
  cards: readonly CardRef[];
  cleanupPolicy: string;
  controllerId?: PlayerId;
  id: string;
  origin: string;
  ownerId?: PlayerId;
  visibility: { type: string; playerId: PlayerId };
};

const privateVisibility = (
  playerId: PlayerId,
): { type: "private"; playerId: PlayerId } => ({
  type: "private",
  playerId,
});

export const createPrivateTopDeckLookSet = (params: {
  count: number;
  playerId: PlayerId;
  setId: string;
  state: GameState;
}): PrivateTopDeckLookSet | null => {
  const player = params.state.players[params.playerId];
  if (player === undefined || player.deck.length === 0) {
    return null;
  }
  return {
    id: params.setId,
    cards: player.deck.slice(0, params.count).map((card) => ({
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: params.playerId,
      zone: card.zone,
    })),
    origin: "topOfDeck",
    ownerId: params.playerId,
    controllerId: params.playerId,
    visibility: privateVisibility(params.playerId),
    cleanupPolicy: "returnToOrigin",
  };
};

export const isCurrentTopDeckLookSet = (
  state: GameState,
  playerId: PlayerId,
  set: TopDeckLookSetLike,
): boolean => {
  if (
    set.cards.length < 1 ||
    set.origin !== "topOfDeck" ||
    set.ownerId !== playerId ||
    set.controllerId !== playerId ||
    set.visibility.type !== "private" ||
    set.visibility.playerId !== playerId
  ) {
    return false;
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return false;
  }
  const lookedDeckCards = player.deck.slice(0, set.cards.length);
  return set.cards.every((card, index) => {
    const deckCard = lookedDeckCards[index];
    return (
      deckCard !== undefined &&
      card.instanceId === deckCard.instanceId &&
      card.cardId === deckCard.cardId &&
      card.playerId === playerId &&
      card.zone !== undefined &&
      zonesEqual(card.zone, deckCard.zone)
    );
  });
};

export const createPrivateLookSetSelectCardsDecision = (params: {
  candidates: readonly CardRef[];
  decisionId: string;
  effectId: EffectQueueEntry["effectBlockId"];
  filter: NonNullable<SelectCardsDecision["request"]["filter"]>;
  max: number;
  playerId: PlayerId;
  prompt: string;
  queueEntryId: EffectQueueEntry["id"];
  remainingCards?: SelectCardsDecision["request"]["remainingCards"];
  requestVisibility: NonNullable<SelectCardsDecision["request"]["visibility"]>;
  setId: string;
}): SelectCardsDecision => {
  const visibility = privateVisibility(params.playerId);
  return {
    id: toDecisionId(params.decisionId),
    type: "selectCards",
    playerId: params.playerId,
    prompt: params.prompt,
    causedBy: {
      type: "effect",
      queueEntryId: params.queueEntryId,
      effectId: params.effectId,
    },
    visibility,
    request: {
      timing: "onResolution",
      chooser: "self",
      set: params.setId as NonNullable<SelectCardsDecision["request"]["set"]>,
      filter: params.filter,
      min: 0,
      max: params.max,
      allowFewerIfUnavailable: true,
      visibility: params.requestVisibility,
      ...(params.remainingCards !== undefined
        ? { remainingCards: params.remainingCards }
        : {}),
    },
    candidates: params.candidates.map((card) => ({
      card: { ...card },
      visibility,
    })),
    defaultResponse: { type: "cards", cards: [] },
  };
};
