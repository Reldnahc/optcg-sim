import type {
  CardInstance,
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import { moveConcreteCardsToTrash } from "../movement/concrete-card-movement.js";

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

type SelectedSetToTrashMoveParams = {
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

const emptySelectedSetToTrashResult = (
  params: SelectedSetToTrashMoveParams,
): {
  events: EngineEvent[];
  ledgers: SegmentLedgers;
  ok: true;
  state: GameState;
} => ({
  events: [],
  ledgers: {
    ...params.ledgers,
    segmentResults: {
      ...params.ledgers.segmentResults,
      [params.segmentKey(params.segment, params.index)]: {
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
});

export const applySetToTrashSelectedCardMoveSegment = (
  params: SelectedSetToTrashMoveParams,
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
  if (selected.length === 0) {
    return emptySelectedSetToTrashResult(params);
  }
  const playerId = selectedRefsPlayerId(selected);
  const player = playerId === null ? undefined : params.state.players[playerId];
  if (
    playerId === null ||
    player === undefined ||
    selected.some((card) => card.zone?.zone !== "deck")
  ) {
    return { ok: false };
  }

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

  const events: EngineEvent[] = [];
  const moved = moveConcreteCardsToTrash(params.state, events, movedCards, {
    cardMovedPayloadExtra: { selectionSetId: String(params.effect.from) },
    cardMovedPayloadShape: "zoneRefs",
    cardMovedVisibility: { type: "public" },
    cardTrashedVisibility: { type: "public" },
    causedBy: {
      type: "effect",
      queueEntryId: params.entry.id,
      effectId: params.entry.effectBlockId,
    },
    emitCardTrashed: true,
    includeCardIdentityInCardMoved: true,
    playerId,
    reason: "moveCards",
    sourceZone: "deck",
  });
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
      ...moved.state,
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};
