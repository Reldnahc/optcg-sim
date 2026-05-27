import type {
  CardInstance,
  CausalityRef,
  EngineEvent,
  EventVisibility,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendEvent } from "./action-results.js";
import { reindexZoneCards } from "./action-state.js";

export const KO_TRASH_MOVEMENT_REASON = "ko";

type TrashSourceZone =
  | "characterArea"
  | "deck"
  | "hand"
  | "noZone"
  | "stageArea";
type TrashInsertPosition = "bottom" | "top";
type CardMovedPayloadShape = "publicZoneNames" | "zoneRefs";

type ConcreteTrashMovementReason =
  | "counter"
  | "effectTrash"
  | "playCard"
  | "lifeTriggerResolved"
  | "moveCards"
  | "searchRevealRemainder"
  | "trashFromField"
  | "trashFromHand"
  | "ruleProcessCharacterOverflow"
  | "ruleProcessStageReplacement"
  | typeof KO_TRASH_MOVEMENT_REASON;

export interface ConcreteTrashMovementOptions {
  cardMovedPayloadShape: CardMovedPayloadShape;
  cardMovedPayloadExtra?: Record<string, unknown>;
  cardMovedVisibility?: EventVisibility;
  cardTrashedVisibility?: EventVisibility;
  causedBy?: CausalityRef;
  clearAttachedDon?: boolean;
  emitCardTrashed: boolean;
  eventBaseState?: GameState;
  includeCardIdentityInCardMoved?: boolean;
  insertPosition: TrashInsertPosition;
  playerId: PlayerId;
  reason: ConcreteTrashMovementReason;
  sourceZone: TrashSourceZone;
}

const sourceCollection = (
  player: NonNullable<GameState["players"][PlayerId]>,
  sourceZone: TrashSourceZone,
): readonly CardInstance[] => {
  if (sourceZone === "characterArea") {
    return player.characters;
  }
  if (sourceZone === "stageArea") {
    return player.stage === undefined ? [] : [player.stage];
  }
  if (sourceZone === "noZone") {
    return [];
  }
  return player[sourceZone];
};

const sourceSlot = (
  sourceZone: Exclude<TrashSourceZone, "noZone" | "stageArea">,
): NonNullable<CardInstance["zone"]["slot"]> =>
  sourceZone === "characterArea" ? "character" : sourceZone;

const sourceZoneName = (sourceZone: TrashSourceZone): string =>
  sourceZone === "characterArea" ? "character" : sourceZone;

const withCausedBy = (
  events: EngineEvent[],
  causedBy: CausalityRef | undefined,
): void => {
  if (causedBy === undefined) {
    return;
  }
  const event = events[events.length - 1];
  if (event !== undefined) {
    event.causedBy = causedBy;
  }
};

const buildMovedCards = (
  cards: readonly CardInstance[],
  playerId: PlayerId,
  options: ConcreteTrashMovementOptions,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    ...(options.clearAttachedDon ? { attachedDon: [] } : {}),
    zone: {
      zone: "trash" as const,
      playerId,
      slot: "trash" as const,
      index,
    },
  }));

const cardMovedPayload = (
  original: CardInstance,
  moved: CardInstance,
  options: ConcreteTrashMovementOptions,
): Record<string, unknown> => {
  const identity = options.includeCardIdentityInCardMoved
    ? { instanceId: moved.instanceId, cardId: moved.cardId }
    : {};
  if (options.cardMovedPayloadShape === "publicZoneNames") {
    return {
      from: sourceZoneName(options.sourceZone),
      to: "trash",
      playerId: options.playerId,
      reason: options.reason,
      ...identity,
      ...options.cardMovedPayloadExtra,
    };
  }
  return {
    ...identity,
    from: original.zone,
    to: moved.zone,
    reason: options.reason,
    ...options.cardMovedPayloadExtra,
  };
};

export const moveConcreteCardsToTrash = (
  state: GameState,
  events: EngineEvent[],
  cards: readonly CardInstance[],
  options: ConcreteTrashMovementOptions,
): { movedCards: CardInstance[]; state: GameState } => {
  const player = state.players[options.playerId];
  if (player === undefined || cards.length === 0) {
    return { movedCards: [], state };
  }

  const movedIds = new Set(cards.map((card) => card.instanceId));
  const currentSourceCards = sourceCollection(player, options.sourceZone);
  const movedCards = buildMovedCards(cards, options.playerId, options);
  const remainingSourceCards = currentSourceCards.filter(
    (card) => !movedIds.has(card.instanceId),
  );
  const nextTrash =
    options.insertPosition === "top"
      ? reindexZoneCards(
          [...movedCards, ...player.trash],
          "trash",
          options.playerId,
          "trash",
        )
      : reindexZoneCards(
          [...player.trash, ...movedCards],
          "trash",
          options.playerId,
          "trash",
        );

  const nextPlayer = { ...player, trash: nextTrash };
  if (options.sourceZone === "stageArea") {
    if (player.stage !== undefined && movedIds.has(player.stage.instanceId)) {
      delete nextPlayer.stage;
    }
  } else if (options.sourceZone === "noZone") {
    // No source collection owns this card at cleanup time.
  } else if (options.sourceZone === "characterArea") {
    nextPlayer.characters = reindexZoneCards(
      [...remainingSourceCards],
      "characterArea",
      options.playerId,
      "character",
    );
  } else {
    nextPlayer[options.sourceZone] = reindexZoneCards(
      [...remainingSourceCards],
      options.sourceZone,
      options.playerId,
      sourceSlot(options.sourceZone),
    );
  }

  const nextState = {
    ...state,
    players: {
      ...state.players,
      [options.playerId]: nextPlayer,
    },
  };

  const eventBaseState = options.eventBaseState ?? state;
  const movedById = new Map(
    nextTrash
      .filter((card) => movedIds.has(card.instanceId))
      .map((card) => [card.instanceId, card]),
  );
  for (const original of cards) {
    const moved = movedById.get(original.instanceId);
    if (moved === undefined) {
      continue;
    }
    appendEvent(
      eventBaseState,
      events,
      "cardMoved",
      cardMovedPayload(original, moved, options),
      options.cardMovedVisibility,
    );
    withCausedBy(events, options.causedBy);
    if (options.emitCardTrashed) {
      appendEvent(
        eventBaseState,
        events,
        "cardTrashed",
        {
          playerId: options.playerId,
          instanceId: moved.instanceId,
          cardId: moved.cardId,
          reason: options.reason,
        },
        options.cardTrashedVisibility,
      );
      withCausedBy(events, options.causedBy);
    }
  }

  return { movedCards: [...movedById.values()], state: nextState };
};
