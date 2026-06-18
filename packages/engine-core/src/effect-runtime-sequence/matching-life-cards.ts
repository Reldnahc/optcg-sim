import type {
  Effect,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import { toCardRef } from "../actions/state.js";
import { toEngineResult, toStateSeq } from "../action-results.js";
import { moveConcreteCardsToTrash } from "../movement/concrete-card-movement.js";
import { resolvePlayerId } from "../runtime/primitives/execute.js";
import type { SegmentLedgers, SupportedSequenceSegment } from "./segments.js";

export type MoveMatchingLifeCardsEffect = Extract<
  Effect,
  { type: "moveMatchingLifeCards" }
>;

type MoveMatchingLifeCardsFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-player-ref";

interface MoveMatchingLifeCardsErrorDetails {
  reason: MoveMatchingLifeCardsFailureReason;
}

const moveMatchingLifeCardsError = (
  effectId: string,
  reason: MoveMatchingLifeCardsFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies MoveMatchingLifeCardsErrorDetails,
});

export const isSupportedMoveMatchingLifeCardsEffect = (
  effect: Effect,
): effect is MoveMatchingLifeCardsEffect =>
  effect.type === "moveMatchingLifeCards" &&
  effect.player === "self" &&
  effect.matcher.faceUp &&
  effect.to.player === effect.player;

export const executeMoveMatchingLifeCardsPrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
): EngineResult => {
  if (!isSupportedMoveMatchingLifeCardsEffect(effect)) {
    return toEngineResult(
      state,
      [],
      [
        moveMatchingLifeCardsError(
          entry.effectBlockId,
          "unsupported-effect-shape",
        ),
      ],
    );
  }

  const playerId = resolvePlayerId(state, entry, effect.player);
  const destinationPlayerId = resolvePlayerId(state, entry, effect.to.player);
  if (
    playerId === undefined ||
    destinationPlayerId === undefined ||
    playerId !== destinationPlayerId
  ) {
    return toEngineResult(
      state,
      [],
      [
        moveMatchingLifeCardsError(
          entry.effectBlockId,
          "unsupported-player-ref",
        ),
      ],
    );
  }

  const player = state.players[playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      [
        moveMatchingLifeCardsError(
          entry.effectBlockId,
          "unsupported-player-ref",
        ),
      ],
    );
  }

  const movedCards = player.life
    .filter((lifeCard) => lifeCard.faceUp === effect.matcher.faceUp)
    .map((lifeCard) => lifeCard.card);
  if (movedCards.length === 0) {
    return toEngineResult(state, []);
  }

  const events: EngineEvent[] = [];
  const movedResult = moveConcreteCardsToTrash(state, events, movedCards, {
    cardMovedPayloadShape: "zoneRefs",
    cardMovedVisibility: { type: "public" },
    cardTrashedVisibility: { type: "public" },
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    emitCardTrashed: true,
    includeCardIdentityInCardMoved: true,
    playerId,
    reason: "moveCards",
    sourceZone: "life",
  });

  return toEngineResult(
    {
      ...movedResult.state,
      seq: toStateSeq(state.seq + 1),
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};

export const applyMoveMatchingLifeCardsSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SupportedSequenceSegment & { effect: MoveMatchingLifeCardsEffect },
  index: number,
  ledgers: SegmentLedgers,
  emptySegmentResult: () => SequenceSegmentResult,
  segmentKey: (
    segment: Extract<Effect, { type: "sequence" }>["effects"][number],
    index: number,
  ) => string,
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const beforePlayer = state.players[entry.controllerId];
  const beforeLifeIds = new Set(
    beforePlayer?.life.map((lifeCard) => lifeCard.card.instanceId) ?? [],
  );
  const resolution = executeMoveMatchingLifeCardsPrimitive(
    state,
    entry,
    segment.effect,
  );
  if (resolution.errors !== undefined) {
    return { ok: false };
  }
  const afterPlayer = resolution.state.players[entry.controllerId];
  const affectedCards =
    afterPlayer === undefined
      ? []
      : afterPlayer.trash
          .filter((card) => beforeLifeIds.has(card.instanceId))
          .map((card) => toCardRef(card, entry.controllerId));
  const result: SequenceSegmentResult = {
    ...emptySegmentResult(),
    attempted: true,
    succeeded: true,
    changedState: resolution.events.length > 0,
    affectedCards,
  };
  return {
    events: resolution.events,
    ledgers: {
      segmentResults: {
        ...ledgers.segmentResults,
        [segmentKey(segment, index)]: result,
      },
      savedReferences: ledgers.savedReferences,
    },
    ok: true,
    state: resolution.state,
  };
};
