import type {
  CardRef,
  Effect,
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  OrderCardsDecision,
  SelectCardsDecision,
  SequenceSegmentResult,
} from "@optcg/types";

import { createSupportedSearchRevealChoiceDecision } from "./effect-runtime-search-reveal.js";
import {
  frameForPausedSequenceDecision,
  findSequenceFrameByDecisionId,
  stateWithPausedSequenceFrame,
} from "./effect-runtime-sequence-frame-decisions.js";
import {
  type SupportedSequenceBlock,
  type SupportedSequenceSegment,
} from "./effect-runtime-sequence-support.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SearchEffect = Extract<Effect, { type: "search" }>;

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

type SequenceRuntimeError = (
  effectId: EffectQueueEntry["effectBlockId"],
  reason:
    | "missing-frame"
    | "missing-queue-entry"
    | "missing-effect-block"
    | "unsupported-sequence-shape"
    | "segment-execution-failed",
) => EngineError;

export const applySearchRevealSequenceSegment = (params: {
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  events: EngineEvent[];
  index: number;
  nextLedgers: SegmentLedgers;
  nextState: GameState;
  segment: SupportedSequenceSegment & { effect: SearchEffect };
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
}):
  | {
      kind: "continued";
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | {
      events: EngineEvent[];
      kind: "paused";
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const {
    emptySegmentResult,
    entry,
    events,
    index,
    nextLedgers,
    nextState,
    segment,
    segmentKey,
  } = params;
  const searchDecision = createSupportedSearchRevealChoiceDecision(
    nextState,
    entry,
    segment.effect,
  );
  const searchLedgers: SegmentLedgers = {
    ...nextLedgers,
    segmentResults: {
      ...nextLedgers.segmentResults,
      [segmentKey(segment, index)]: {
        ...emptySegmentResult(),
        attempted: true,
        succeeded: true,
      },
    },
  };
  if (!searchDecision.ok) {
    return { ok: false };
  }
  if (searchDecision.kind === "noEligibleCandidate") {
    return {
      kind: "continued",
      ledgers: searchLedgers,
      ok: true,
      state: searchDecision.state,
    };
  }
  const decision = searchDecision.state.pendingDecision;
  if (decision === undefined) {
    return { ok: false };
  }
  const frame = frameForPausedSequenceDecision({
    decision,
    entry,
    index,
    savedReferences: searchLedgers.savedReferences,
    segmentResults: searchLedgers.segmentResults,
    state: searchDecision.state,
  });
  return {
    events: [...events, ...searchDecision.events],
    kind: "paused",
    ok: true,
    state: stateWithPausedSequenceFrame(searchDecision.state, entry, frame),
  };
};

export const resumeSequenceFrameAfterSearchRevealHelper = (params: {
  createUnsupportedTrashDecision: unknown;
  emptySegmentResult: () => SequenceSegmentResult;
  findFrameQueueEntry: (
    state: GameState,
    frame: EffectExecutionFrame,
  ) => EffectQueueEntry | undefined;
  findSequenceEffectBlock: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => EffectDefinition["effects"][number] | undefined;
  isSupportedSequenceBlock: (
    entry: EffectQueueEntry,
    effectBlock: EffectDefinition["effects"][number] | undefined,
  ) => effectBlock is SupportedSequenceBlock;
  resumeSequenceFrameFromLedgers: (params: {
    createTrashDecision: unknown;
    effectBlock: SupportedSequenceBlock;
    entry: EffectQueueEntry;
    finalizeCompleted: boolean;
    frame: EffectExecutionFrame;
    ledgers: SegmentLedgers;
    state: GameState;
  }) => SequenceFrameResumeResult;
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  sequenceRuntimeError: SequenceRuntimeError;
  state: GameState;
  decisionId: SelectCardsDecision["id"];
  selectedCards: readonly CardRef[];
}): SequenceFrameResumeResult => {
  const frame = findSequenceFrameByDecisionId(params.state, params.decisionId);
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
  if (!params.isSupportedSequenceBlock(entry, effectBlock)) {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "missing-effect-block",
      ),
      ok: false,
    };
  }
  const pausedIndex = frame.pendingDecision.resumeAtSegmentIndex;
  const pausedSegment = effectBlock.effect.effects[pausedIndex];
  if (pausedSegment === undefined || pausedSegment.effect.type !== "search") {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const existingResult =
    frame.segmentResults[params.segmentKey(pausedSegment, pausedIndex)];
  const resolvedSelectedCards =
    params.selectedCards.length > 0
      ? params.selectedCards
      : existingResult?.selectedCards;
  return params.resumeSequenceFrameFromLedgers({
    createTrashDecision: params.createUnsupportedTrashDecision,
    effectBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: {
      savedReferences: frame.savedReferences,
      segmentResults: {
        ...frame.segmentResults,
        [params.segmentKey(pausedSegment, pausedIndex)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState:
            params.selectedCards.length > 0 ||
            existingResult?.changedState === true,
          selectedCards: [...(resolvedSelectedCards ?? [])],
        },
      },
    },
    state: params.state,
  });
};

export const retargetSequenceFrameAfterSearchRevealOrder = (
  state: GameState,
  fromDecisionId: SelectCardsDecision["id"],
  orderDecision: OrderCardsDecision,
  selectedCards: readonly CardRef[],
): GameState => ({
  ...state,
  effectExecutionFrames: state.effectExecutionFrames.map((frame) => {
    if (frame.pendingDecision.decisionId !== fromDecisionId) {
      return frame;
    }
    const pausedIndex = frame.pendingDecision.resumeAtSegmentIndex;
    const pausedKey = String(pausedIndex);
    return {
      ...frame,
      pendingDecision: {
        ...frame.pendingDecision,
        decisionId: orderDecision.id,
        causedBy: orderDecision.causedBy,
      },
      segmentResults: {
        ...frame.segmentResults,
        [pausedKey]: {
          attempted: true,
          succeeded: true,
          changedState: selectedCards.length > 0,
          selectedCards: [...selectedCards],
          selectedTargets: [],
          paidCost: false,
          playerDeclined: false,
        },
      },
    };
  }),
});
