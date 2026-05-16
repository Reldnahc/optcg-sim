import type {
  CardInstance,
  CardRef,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SavedFieldObjectReference,
  SequenceSavedResultReference,
  SequenceSegmentResult,
} from "@optcg/types";

import { toCardRef } from "./action-state.js";
import { executeNoChoiceEffectPrimitive } from "./effect-runtime-primitives.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type DrawEffect = Extract<Effect, { type: "draw" }>;

export type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

export type SupportedSequenceSegment = SequenceEffect["effects"][number] & {
  effect:
    | DrawEffect
    | Extract<Effect, { type: "trashFromHand" }>
    | Extract<SequenceEffect["effects"][number]["effect"], { type: "payCost" }>
    | Extract<Effect, { type: "selectCards" }>;
};

export const resolvingEntryFor = (
  entry: EffectQueueEntry,
): EffectQueueEntry => ({
  ...entry,
  state: "resolving",
});

export const replaceQueueEntry = (
  state: GameState,
  entry: EffectQueueEntry,
): GameState => ({
  ...state,
  effectQueue: state.effectQueue.map((candidate) =>
    candidate.id === entry.id ? entry : candidate,
  ),
});

export const removeFrame = (
  state: GameState,
  frame: EffectExecutionFrame,
): GameState => ({
  ...state,
  effectExecutionFrames: state.effectExecutionFrames.filter(
    (candidate) =>
      candidate.queueEntryId !== frame.queueEntryId ||
      candidate.pendingDecision.decisionId !== frame.pendingDecision.decisionId,
  ),
});

export const activeDonCount = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
): number =>
  state.players[playerId]?.costArea.filter((card) => card.state === "active")
    .length ?? 0;

export const previousSegmentSucceeded = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  effect: SequenceEffect,
  index: number,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
): boolean => {
  const previous = effect.effects[index - 1];
  if (previous === undefined) {
    return false;
  }
  const result = segmentResults[segmentKey(previous, index - 1)];
  return (
    result !== undefined &&
    result.succeeded &&
    (result.changedState ||
      result.selectedCards.length > 0 ||
      result.selectedTargets.length > 0 ||
      result.paidCost)
  );
};

export const previousSegmentCompleted = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  effect: SequenceEffect,
  index: number,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
): boolean => {
  const previous = effect.effects[index - 1];
  if (previous === undefined) {
    return false;
  }
  const result = segmentResults[segmentKey(previous, index - 1)];
  return result !== undefined && result.attempted && result.succeeded;
};

export const shouldAttemptSegment = (
  segmentResults: EffectExecutionFrame["segmentResults"],
  effect: SequenceEffect,
  index: number,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
): boolean => {
  const segment = effect.effects[index];
  if (segment === undefined) {
    return false;
  }
  if (segment.connector === "always") {
    return true;
  }
  if (segment.connector === "then") {
    return previousSegmentCompleted(segmentResults, effect, index, segmentKey);
  }
  return previousSegmentSucceeded(segmentResults, effect, index, segmentKey);
};

const playerHandProducedByDraw = (
  before: readonly CardInstance[],
  after: readonly CardInstance[],
  playerId: EffectQueueEntry["controllerId"],
): CardRef[] => {
  const beforeIds = new Set(before.map((card) => card.instanceId));
  return after
    .filter((card) => !beforeIds.has(card.instanceId))
    .map((card) => toCardRef(card, playerId));
};

const toSavedProducedObjects = (
  segment: SupportedSequenceSegment & {
    effect: DrawEffect;
    saveResultAs: string;
  },
  objects: CardRef[],
  capturedAtStateSeq: GameState["seq"],
): SavedFieldObjectReference[] =>
  objects.map((object, objectIndex) => ({
    binding: {
      family: "producedObjects",
      objectIndex,
      saveResultAs: segment.saveResultAs,
      ...(segment.id === undefined ? {} : { sourceSegmentId: segment.id }),
    },
    capturedAtStateSeq,
    object,
    visibility: "public",
  }));

export const saveReference = (
  savedReferences: EffectExecutionFrame["savedReferences"],
  segment: SequenceEffect["effects"][number],
  reference: SequenceSavedResultReference,
): EffectExecutionFrame["savedReferences"] =>
  segment.saveResultAs === undefined
    ? savedReferences
    : { ...savedReferences, [segment.saveResultAs]: reference };

export const applyDrawSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SupportedSequenceSegment & { effect: DrawEffect },
  index: number,
  ledgers: SegmentLedgers,
  emptySegmentResult: () => SequenceSegmentResult,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
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
  if (beforePlayer === undefined) {
    return { ok: false };
  }
  const resolution = executeNoChoiceEffectPrimitive(
    state,
    entry,
    segment.effect,
  );
  if (resolution.errors !== undefined) {
    return { ok: false };
  }
  const afterPlayer = resolution.state.players[entry.controllerId];
  if (afterPlayer === undefined) {
    return { ok: false };
  }
  const produced = playerHandProducedByDraw(
    beforePlayer.hand,
    afterPlayer.hand,
    entry.controllerId,
  );
  const savedReferences =
    segment.saveResultAs === undefined
      ? ledgers.savedReferences
      : saveReference(ledgers.savedReferences, segment, {
          kind: "producedObjects",
          objects: toSavedProducedObjects(
            { ...segment, saveResultAs: segment.saveResultAs },
            produced,
            resolution.state.seq,
          ),
        });
  const result: SequenceSegmentResult = {
    ...emptySegmentResult(),
    attempted: true,
    succeeded: true,
    changedState: resolution.events.length > 0,
  };
  return {
    events: resolution.events,
    ledgers: {
      segmentResults: {
        ...ledgers.segmentResults,
        [segmentKey(segment, index)]: result,
      },
      savedReferences,
    },
    ok: true,
    state: resolution.state,
  };
};
