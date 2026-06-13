import type {
  CardInstance,
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  LifeCard,
  PlayerId,
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

type SelectedHandToLifeMoveParams = {
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
  playerId: PlayerId,
): LifeCard[] =>
  life.map((entry, index) => ({
    ...entry,
    card: {
      ...entry.card,
      zone: {
        zone: "life",
        playerId,
        slot: "life",
        index,
      },
    },
  }));

export const applyHandToLifeSelectedCardMoveSegment = (
  params: SelectedHandToLifeMoveParams,
  selected: readonly CardRef[],
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const playerId = selectedRefsPlayerId(selected);
  const player = playerId === null ? undefined : params.state.players[playerId];
  if (playerId === null || player === undefined || selected.length > 1) {
    return { ok: false };
  }
  const selectedIds = new Set(selected.map((card) => card.instanceId));
  const movedCards: CardInstance[] = [];
  for (const selectedCard of selected) {
    const current = player.hand.find(
      (card) =>
        card.instanceId === selectedCard.instanceId &&
        card.cardId === selectedCard.cardId,
    );
    if (current === undefined) {
      return { ok: false };
    }
    movedCards.push(current);
  }
  const nextHand = reindexZoneCards(
    player.hand.filter((card) => !selectedIds.has(card.instanceId)),
    "hand",
    playerId,
    "hand",
  );
  const movedLifeCards = movedCards.map(
    (card, index): LifeCard => ({
      faceUp: params.effect.destinationFaceUp === true,
      card: {
        ...card,
        attachedDon: [],
        zone: {
          zone: "life",
          playerId,
          slot: "life",
          index,
        },
      },
    }),
  );
  const nextLife = reindexLifeCards(
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
        from: { zone: "hand", playerId, slot: "hand" },
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
