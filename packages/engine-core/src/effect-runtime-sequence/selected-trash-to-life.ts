import type {
  CardInstance,
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  EventVisibility,
  GameState,
  LifeCard,
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

type SelectedTrashToLifeMoveParams = {
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
  playerId: CardRef["playerId"],
): LifeCard[] =>
  cards.map((lifeCard, index) => ({
    ...lifeCard,
    card: {
      ...lifeCard.card,
      zone: { zone: "life", playerId, slot: "life", index },
    },
  }));

export const applyTrashToLifeSelectedCardMoveSegment = (
  params: SelectedTrashToLifeMoveParams,
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
  if (playerId === null || player === undefined) {
    return { ok: false };
  }
  const selectedIds = new Set(selected.map((card) => card.instanceId));
  const movedCards: CardInstance[] = [];
  for (const selectedCard of selected) {
    const current = player.trash.find(
      (card) =>
        card.instanceId === selectedCard.instanceId &&
        card.cardId === selectedCard.cardId,
    );
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
  const nextTrash = reindexZoneCards(
    player.trash.filter((card) => !selectedIds.has(card.instanceId)),
    "trash",
    playerId,
    "trash",
  );
  const nextLife = reindexLife([...movedLifeCards, ...player.life], playerId);
  const eventBaseState: GameState = {
    ...params.state,
    players: {
      ...params.state.players,
      [playerId]: {
        ...player,
        life: nextLife,
        trash: nextTrash,
      },
    },
  };
  const events: EngineEvent[] = [];
  for (const card of movedCards) {
    const moved = nextLife.find(
      (candidate) => candidate.card.instanceId === card.instanceId,
    );
    appendEvent(
      eventBaseState,
      events,
      "cardMoved",
      {
        instanceId: card.instanceId,
        cardId: card.cardId,
        from: card.zone,
        to: moved?.card.zone,
        reason: "effect",
      },
      { type: "public" },
    );
    const event = events[events.length - 1];
    if (event !== undefined) {
      event.causedBy = {
        type: "effect",
        queueEntryId: params.entry.id,
        effectId: params.entry.effectBlockId,
      };
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

export const applySetToLifeSelectedCardMoveSegment = (
  params: SelectedTrashToLifeMoveParams,
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
  if (selected.some((card) => card.zone?.zone !== "deck")) {
    return { ok: false };
  }

  const selectedIds = new Set(selected.map((card) => card.instanceId));
  const movedCards: CardInstance[] = [];
  for (const selectedCard of selected) {
    const current = player.deck.find(
      (card) =>
        card.instanceId === selectedCard.instanceId &&
        card.cardId === selectedCard.cardId,
    );
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
  const nextDeck = reindexZoneCards(
    player.deck.filter((card) => !selectedIds.has(card.instanceId)),
    "deck",
    playerId,
    "deck",
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
        deck: nextDeck,
        life: nextLife,
      },
    },
  };
  const selectionSetId = String(params.effect.from);
  let revealVisibility: EventVisibility | undefined;
  for (
    let recordIndex = params.state.revealedCards.length - 1;
    recordIndex >= 0;
    recordIndex -= 1
  ) {
    const record = params.state.revealedCards[recordIndex];
    if (record?.selectionSetId === selectionSetId) {
      revealVisibility = record.visibility;
      break;
    }
  }
  const visibility =
    revealVisibility ??
    ({ type: "private", playerId } satisfies EventVisibility);
  const events: EngineEvent[] = [];
  for (const card of movedCards) {
    const moved = nextLife.find(
      (candidate) => candidate.card.instanceId === card.instanceId,
    );
    if (moved === undefined) {
      return { ok: false };
    }
    appendEvent(
      eventBaseState,
      events,
      "cardMoved",
      {
        instanceId: card.instanceId,
        cardId: card.cardId,
        from: card.zone,
        to: moved.card.zone,
        reason: "effect",
      },
      visibility,
    );
    const event = events[events.length - 1];
    if (event !== undefined) {
      event.causedBy = {
        type: "effect",
        queueEntryId: params.entry.id,
        effectId: params.entry.effectBlockId,
      };
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
