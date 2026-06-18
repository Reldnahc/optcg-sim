import type {
  CardInstance,
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  LifeCard,
  PlayerId,
  PlayerState,
  SequenceSegmentResult,
} from "@optcg/types";

import { reindexZoneCards } from "../actions/state.js";
import { appendEvent } from "../action-results.js";

type MoveSelectedEffect = Extract<Effect, { type: "moveSelected" }>;
type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SegmentLedgers = {
  savedReferences: NonNullable<
    GameState["effectExecutionFrames"][number]
  >["savedReferences"];
  segmentResults: NonNullable<
    GameState["effectExecutionFrames"][number]
  >["segmentResults"];
};

type SelectedCurrentToLifeMoveParams = {
  effect: MoveSelectedEffect;
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SequenceEffect["effects"][number];
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  state: GameState;
};

const selectedRefsPlayerId = (
  selected: readonly CardRef[],
): CardRef["playerId"] | null => {
  const first = selected[0]?.playerId;
  if (first === undefined) {
    return null;
  }
  return selected.every((card) => card.playerId === first) ? first : null;
};

const reindexLife = (
  cards: readonly LifeCard[],
  playerId: PlayerId,
): LifeCard[] =>
  cards.map((lifeCard, index) => ({
    ...lifeCard,
    card: {
      ...lifeCard.card,
      zone: { zone: "life", playerId, slot: "life", index },
    },
  }));

const selectedCurrentCard = (
  player: PlayerState,
  selectedCard: CardRef,
): CardInstance | undefined => {
  if (selectedCard.zone?.zone === "hand") {
    return player.hand.find(
      (card) =>
        card.instanceId === selectedCard.instanceId &&
        card.cardId === selectedCard.cardId,
    );
  }
  if (selectedCard.zone?.zone === "trash") {
    return player.trash.find(
      (card) =>
        card.instanceId === selectedCard.instanceId &&
        card.cardId === selectedCard.cardId,
    );
  }
  return undefined;
};

export const applyCurrentZoneToLifeSelectedCardMoveSegment = (
  params: SelectedCurrentToLifeMoveParams,
  selected: readonly CardRef[],
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const resultKey = params.segmentKey(params.segment, params.index);
  if (selected.length === 0) {
    return {
      events: [],
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [resultKey]: {
            ...params.emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: false,
            selectedCards: [],
          },
        },
      },
      ok: true,
      state: params.state,
    };
  }
  const playerId = selectedRefsPlayerId(selected);
  const player = playerId === null ? undefined : params.state.players[playerId];
  if (
    playerId === null ||
    player === undefined ||
    (params.effect.position !== "top" && params.effect.position !== "bottom")
  ) {
    return { ok: false };
  }

  const selectedIds = new Set(selected.map((card) => card.instanceId));
  const movedCards: CardInstance[] = [];
  for (const selectedCard of selected) {
    const current = selectedCurrentCard(player, selectedCard);
    if (current === undefined) {
      return { ok: false };
    }
    movedCards.push(current);
  }

  const movedLifeCards = movedCards.map(
    (card, index): LifeCard => ({
      faceUp: params.effect.destinationFaceUp === true,
      card: {
        ...card,
        attachedDon: [],
        zone: { zone: "life", playerId, slot: "life", index },
      },
    }),
  );
  const nextHand = reindexZoneCards(
    player.hand.filter((card) => !selectedIds.has(card.instanceId)),
    "hand",
    playerId,
    "hand",
  );
  const nextTrash = reindexZoneCards(
    player.trash.filter((card) => !selectedIds.has(card.instanceId)),
    "trash",
    playerId,
    "trash",
  );
  const nextLife = reindexLife(
    params.effect.position === "top"
      ? [...movedLifeCards, ...player.life]
      : [...player.life, ...movedLifeCards],
    playerId,
  );
  const eventBaseState: GameState = {
    ...params.state,
    players: {
      ...params.state.players,
      [playerId]: {
        ...player,
        hand: nextHand,
        life: nextLife,
        trash: nextTrash,
      },
    },
  };
  const events: EngineEvent[] = [];
  for (const card of movedCards) {
    const moved = nextLife.find(
      (candidate) => candidate.card.instanceId === card.instanceId,
    )?.card;
    appendEvent(
      eventBaseState,
      events,
      "cardMoved",
      {
        ...(card.zone.zone === "trash"
          ? { instanceId: card.instanceId, cardId: card.cardId }
          : {}),
        from:
          card.zone.zone === "trash"
            ? card.zone
            : { zone: "hand", playerId, slot: "hand" },
        to: {
          zone: "life",
          playerId,
          slot: "life",
          position: params.effect.position,
        },
        reason: "effect",
      },
      { type: "public" },
    );
    const publicEvent = events[events.length - 1];
    if (publicEvent !== undefined) {
      publicEvent.causedBy = {
        type: "effect",
        queueEntryId: params.entry.id,
        effectId: params.entry.effectBlockId,
      };
    }
    if (card.zone.zone === "hand") {
      appendEvent(
        eventBaseState,
        events,
        "cardMoved",
        {
          instanceId: card.instanceId,
          cardId: card.cardId,
          from: card.zone,
          to: moved?.zone,
          reason: "effect",
        },
        { type: "private", playerId },
      );
      const privateEvent = events[events.length - 1];
      if (privateEvent !== undefined) {
        privateEvent.causedBy = {
          type: "effect",
          queueEntryId: params.entry.id,
          effectId: params.entry.effectBlockId,
        };
      }
    }
  }
  return {
    events,
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [resultKey]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: movedCards.length > 0,
          selectedCards: [...selected],
        },
      },
    },
    ok: true,
    state: {
      ...eventBaseState,
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};
