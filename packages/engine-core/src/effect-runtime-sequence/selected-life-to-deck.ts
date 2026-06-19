import type {
  CardInstance,
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineEvent,
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

type SelectedLifeToDeckMoveParams = {
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

const reindexLifeCards = (
  life: readonly LifeCard[],
  playerId: CardRef["playerId"],
): LifeCard[] =>
  life.map((lifeCard, index) => ({
    ...lifeCard,
    card: {
      ...lifeCard.card,
      zone: { zone: "life", playerId, slot: "life", index },
    },
  }));

export const applyLifeToDeckBottomSelectedCardMoveSegment = (
  params: SelectedLifeToDeckMoveParams,
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
    const current = player.life
      .map((lifeCard) => lifeCard.card)
      .find(
        (card) =>
          card.instanceId === selectedCard.instanceId &&
          card.cardId === selectedCard.cardId,
      );
    if (current === undefined) {
      return { ok: false };
    }
    movedCards.push(current);
  }

  const nextLife = reindexLifeCards(
    player.life.filter(
      (lifeCard) => !selectedIds.has(lifeCard.card.instanceId),
    ),
    playerId,
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
        life: nextLife,
      },
    },
  };
  const events: EngineEvent[] = [];
  for (let remaining = movedCards.length; remaining > 0; remaining -= 1) {
    appendEvent(
      eventBaseState,
      events,
      "cardMoved",
      {
        from: { zone: "life", playerId, slot: "life" },
        to: {
          zone: "deck",
          playerId,
          slot: "deck",
          position: "bottom",
        },
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
