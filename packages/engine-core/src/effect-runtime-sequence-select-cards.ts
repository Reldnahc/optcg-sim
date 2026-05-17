import type {
  CardRef,
  Effect,
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  SelectCardsDecision,
  SequenceSegmentResult,
} from "@optcg/types";

import { saveReference } from "./effect-runtime-sequence-segments.js";
import { isSupportedSequenceBlock } from "./effect-runtime-sequence-support.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;

type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

type SequenceFrameResumeResult =
  | {
      events: EngineEvent[];
      ok: true;
      state: GameState;
    }
  | {
      error: EngineError;
      ok: false;
    }
  | undefined;

type ResumeSequenceFrameFromLedgers = (params: {
  createTrashDecision: unknown;
  effectBlock: unknown;
  entry: EffectQueueEntry;
  finalizeCompleted: boolean;
  frame: EffectExecutionFrame;
  ledgers: SegmentLedgers;
  state: GameState;
}) => SequenceFrameResumeResult;

type SequenceRuntimeError = (
  effectId: EffectQueueEntry["effectBlockId"],
  reason:
    | "missing-frame"
    | "missing-queue-entry"
    | "missing-effect-block"
    | "unsupported-sequence-shape"
    | "segment-execution-failed",
) => EngineError;

export const resumeSequenceFrameAfterTrashFromHand = (params: {
  createUnsupportedTrashDecision: unknown;
  decision: SelectCardsDecision;
  emptySegmentResult: () => SequenceSegmentResult;
  findFrameQueueEntry: (
    state: GameState,
    frame: EffectExecutionFrame,
  ) => EffectQueueEntry | undefined;
  findSequenceEffectBlock: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => EffectDefinition["effects"][number] | undefined;
  resumeSequenceFrameFromLedgers: ResumeSequenceFrameFromLedgers;
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  selectedCards: readonly CardRef[];
  sequenceRuntimeError: SequenceRuntimeError;
  state: GameState;
}): SequenceFrameResumeResult => {
  const frame = params.state.effectExecutionFrames.find(
    (candidate) => candidate.pendingDecision.decisionId === params.decision.id,
  );
  if (frame === undefined) {
    return undefined;
  }
  const entry = params.findFrameQueueEntry(params.state, frame);
  if (entry === undefined) {
    return {
      error: params.sequenceRuntimeError(
        frame.effectBlockId,
        "missing-queue-entry",
      ),
      ok: false,
    };
  }
  const effectBlock = params.findSequenceEffectBlock(params.state, entry);
  if (!isSupportedSequenceBlock(entry, effectBlock)) {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "missing-effect-block",
      ),
      ok: false,
    };
  }
  const pausedSegment =
    effectBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    pausedSegment.effect.type !== "trashFromHand"
  ) {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }

  const completedPausedResult: SequenceSegmentResult = {
    ...params.emptySegmentResult(),
    attempted: true,
    succeeded: true,
    changedState: params.selectedCards.length > 0,
    selectedCards: [...params.selectedCards],
  };
  return params.resumeSequenceFrameFromLedgers({
    createTrashDecision: params.createUnsupportedTrashDecision,
    effectBlock,
    entry,
    finalizeCompleted: false,
    frame,
    ledgers: {
      segmentResults: {
        ...frame.segmentResults,
        [params.segmentKey(
          pausedSegment,
          frame.pendingDecision.resumeAtSegmentIndex,
        )]: completedPausedResult,
      },
      savedReferences: saveReference(frame.savedReferences, pausedSegment, {
        kind: "selectedCards",
        cards: [...params.selectedCards],
      }),
    },
    state: params.state,
  });
};

export const resumeSequenceFrameAfterHandSelection = (params: {
  createUnsupportedTrashDecision: unknown;
  decision: SelectCardsDecision;
  emptySegmentResult: () => SequenceSegmentResult;
  findFrameQueueEntry: (
    state: GameState,
    frame: EffectExecutionFrame,
  ) => EffectQueueEntry | undefined;
  findSequenceEffectBlock: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => EffectDefinition["effects"][number] | undefined;
  resumeSequenceFrameFromLedgers: ResumeSequenceFrameFromLedgers;
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  selectedCards: readonly CardRef[];
  sequenceRuntimeError: SequenceRuntimeError;
  state: GameState;
}): SequenceFrameResumeResult => {
  const frame = params.state.effectExecutionFrames.find(
    (candidate) => candidate.pendingDecision.decisionId === params.decision.id,
  );
  if (frame === undefined) {
    return undefined;
  }
  const entry = params.findFrameQueueEntry(params.state, frame);
  if (entry === undefined) {
    return {
      error: params.sequenceRuntimeError(
        frame.effectBlockId,
        "missing-queue-entry",
      ),
      ok: false,
    };
  }
  const effectBlock = params.findSequenceEffectBlock(params.state, entry);
  if (!isSupportedSequenceBlock(entry, effectBlock)) {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "missing-effect-block",
      ),
      ok: false,
    };
  }
  const pausedSegment =
    effectBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    pausedSegment.effect.type !== "selectCards" ||
    pausedSegment.effect.zone !== "hand"
  ) {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }

  const completedPausedResult: SequenceSegmentResult = {
    ...params.emptySegmentResult(),
    attempted: true,
    succeeded: true,
    changedState: false,
    selectedCards: [...params.selectedCards],
  };
  return params.resumeSequenceFrameFromLedgers({
    createTrashDecision: params.createUnsupportedTrashDecision,
    effectBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: {
      segmentResults: {
        ...frame.segmentResults,
        [params.segmentKey(
          pausedSegment,
          frame.pendingDecision.resumeAtSegmentIndex,
        )]: completedPausedResult,
      },
      savedReferences: {
        ...frame.savedReferences,
        [pausedSegment.effect.saveAs]: {
          kind: "selectedCards",
          cards: [...params.selectedCards],
        },
      },
    },
    state: params.state,
  });
};
