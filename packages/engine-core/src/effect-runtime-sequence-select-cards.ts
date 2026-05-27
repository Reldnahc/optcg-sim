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
import { toSupportedSequenceBlock } from "./effect-runtime-sequence-support.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;

const toSingleEffectSequence = (effect: Effect): SequenceEffect => ({
  type: "sequence",
  effects: [{ connector: "always", effect }],
});

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

const rootSequenceEffectPath = ["effect", "sequence"] as const;

const isRootSequencePath = (effectPath: readonly string[]): boolean =>
  effectPath.length === rootSequenceEffectPath.length &&
  effectPath.every((part, index) => part === rootSequenceEffectPath[index]);

const resolveSequenceForPath = (
  effect: SequenceEffect,
  effectPath: readonly string[],
): SequenceEffect | undefined => {
  if (!isRootSequencePath(effectPath)) {
    if (
      effectPath.length < rootSequenceEffectPath.length ||
      !isRootSequencePath(effectPath.slice(0, rootSequenceEffectPath.length))
    ) {
      return undefined;
    }
  }
  let current: SequenceEffect = effect;
  let index = rootSequenceEffectPath.length;
  while (index < effectPath.length) {
    const segmentIndex = Number(effectPath[index]);
    const thenToken = effectPath[index + 1];
    const sequenceToken = effectPath[index + 2];
    if (!Number.isSafeInteger(segmentIndex) || thenToken !== "then") {
      return undefined;
    }
    const segment = current.effects[segmentIndex];
    if (segment === undefined || segment.effect.type !== "conditional") {
      return undefined;
    }
    if (sequenceToken === "sequence") {
      if (segment.effect.then.type !== "sequence") {
        return undefined;
      }
      current = segment.effect.then;
    } else if (sequenceToken === "single") {
      if (segment.effect.then.type === "sequence") {
        return undefined;
      }
      current = toSingleEffectSequence(segment.effect.then);
    } else {
      return undefined;
    }
    index += 3;
  }
  return current;
};

const segmentKeyForPath = (
  effectPath: readonly string[],
  segment: SequenceEffect["effects"][number],
  index: number,
): string =>
  isRootSequencePath(effectPath)
    ? paramsSegmentKey(segment, index)
    : `${effectPath.join(".")}:${paramsSegmentKey(segment, index)}`;

const paramsSegmentKey = (
  _segment: SequenceEffect["effects"][number],
  index: number,
): string => String(index);

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
  const effectBlock = toSupportedSequenceBlock(
    entry,
    params.findSequenceEffectBlock(params.state, entry),
  );
  if (effectBlock === undefined) {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "missing-effect-block",
      ),
      ok: false,
    };
  }
  const pausedSegment = resolveSequenceForPath(
    effectBlock.effect,
    frame.effectPath,
  )?.effects[frame.pendingDecision.resumeAtSegmentIndex];
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
        [segmentKeyForPath(
          frame.effectPath,
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
  const effectBlock = toSupportedSequenceBlock(
    entry,
    params.findSequenceEffectBlock(params.state, entry),
  );
  if (effectBlock === undefined) {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "missing-effect-block",
      ),
      ok: false,
    };
  }
  const pausedSegment = resolveSequenceForPath(
    effectBlock.effect,
    frame.effectPath,
  )?.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    pausedSegment.effect.type !== "selectCards"
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
        [segmentKeyForPath(
          frame.effectPath,
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
