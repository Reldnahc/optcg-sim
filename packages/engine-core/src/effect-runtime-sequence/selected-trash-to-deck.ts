import type {
  CardInstance,
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
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

type SelectedTrashToDeckMoveParams = {
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

export const applyTrashToDeckBottomSelectedCardMoveSegment = (
  params: SelectedTrashToDeckMoveParams,
  selected: readonly CardRef[],
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      paused?: false;
      state: GameState;
    }
  | { ok: false } => {
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
  const nextTrash = reindexZoneCards(
    player.trash.filter((card) => !selectedIds.has(card.instanceId)),
    "trash",
    playerId,
    "trash",
  );
  const nextDeck = reindexZoneCards(
    [...player.deck, ...movedCards],
    "deck",
    playerId,
    "deck",
  );
  const eventBaseState: GameState = {
    ...params.state,
    players: {
      ...params.state.players,
      [playerId]: {
        ...player,
        deck: nextDeck,
        trash: nextTrash,
      },
    },
  };
  const events: EngineEvent[] = [];
  for (const card of movedCards) {
    const moved = nextDeck.find(
      (candidate) => candidate.instanceId === card.instanceId,
    );
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
        [params.segmentKey(params.segment, params.index)]: {
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
