import type {
  CardRef,
  Effect,
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  SavedFieldObjectReference,
  SelectTargetsDecision,
  SequenceSegmentResult,
} from "@optcg/types";

import { appendEvent, toDecisionId, toStateSeq } from "./action-results.js";
import { resolvePlayerId } from "./effect-runtime-primitives.js";
import {
  frameForPausedSequenceDecision,
  stateWithPausedSequenceFrame,
} from "./effect-runtime-sequence-frame-decisions.js";
import { saveReference } from "./effect-runtime-sequence-segments.js";
import {
  isSupportedSequenceBlock,
  type SupportedSequenceSegment,
} from "./effect-runtime-sequence-support.js";
import { resolvePublicTargetCandidates } from "./target-selection.js";

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

export const applySelectTargetsSequenceSegment = (params: {
  entry: EffectQueueEntry;
  emptySegmentResult: () => SequenceSegmentResult;
  events: EngineEvent[];
  index: number;
  nextLedgers: SegmentLedgers;
  nextState: GameState;
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  segment: SupportedSequenceSegment & {
    effect: Extract<
      SupportedSequenceSegment["effect"],
      { type: "selectTargets" }
    >;
  };
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
  const candidates = resolvePublicTargetCandidates(
    nextState,
    segment.effect.request,
    {
      sourceControllerId: entry.controllerId,
    },
  );
  const chooserId = resolvePlayerId(
    nextState,
    entry,
    segment.effect.request.chooser,
  );
  if (!candidates.ok || chooserId === undefined) {
    return { ok: false };
  }
  const minimumRequired = segment.effect.request.allowFewerIfUnavailable
    ? Math.min(segment.effect.request.min, candidates.candidates.length)
    : segment.effect.request.min;
  if (candidates.candidates.length < minimumRequired) {
    return {
      kind: "continued",
      ledgers: {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [segmentKey(segment, index)]: {
            ...emptySegmentResult(),
            attempted: true,
          },
        },
      },
      ok: true,
      state: nextState,
    };
  }
  const decision: SelectTargetsDecision = {
    id: toDecisionId(
      `decision:selectTargets:sequence:${String(entry.id)}:${String(index)}`,
    ),
    type: "selectTargets",
    playerId: chooserId,
    prompt: "Select targets.",
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    visibility: { type: "public" },
    request: segment.effect.request,
    candidates: candidates.candidates,
  };
  const decisionEvents: EngineEvent[] = [];
  appendEvent(
    nextState,
    decisionEvents,
    "decisionCreated",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
    },
    { type: "public" },
  );
  const created = decisionEvents[0];
  if (created !== undefined) {
    created.causedBy = decision.causedBy;
  }
  const decisionState: GameState = {
    ...nextState,
    seq: toStateSeq(nextState.seq + 1),
    pendingDecision: decision,
    eventJournal: [...nextState.eventJournal, ...decisionEvents],
  };
  const frame = frameForPausedSequenceDecision({
    decision,
    entry,
    index,
    savedReferences: nextLedgers.savedReferences,
    segmentResults: nextLedgers.segmentResults,
    state: decisionState,
  });
  return {
    events: [...events, ...decisionEvents],
    kind: "paused",
    ok: true,
    state: stateWithPausedSequenceFrame(decisionState, entry, frame),
  };
};

export const isSequenceFrameSelectTargetsDecision = (
  state: GameState,
  decisionId: SelectTargetsDecision["id"],
): boolean =>
  state.effectExecutionFrames.some(
    (frame) => frame.pendingDecision.decisionId === decisionId,
  );

export const resumeSequenceFrameAfterSelectTargets = (params: {
  createUnsupportedTrashDecision: unknown;
  decision: SelectTargetsDecision;
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
  selectedTargets: readonly CardRef[];
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
    pausedSegment.effect.type !== "selectTargets"
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
    selectedTargets: [...params.selectedTargets],
  };
  const saveResultAs = pausedSegment.saveResultAs;
  const savedReferences =
    saveResultAs === undefined
      ? frame.savedReferences
      : saveReference(frame.savedReferences, pausedSegment, {
          kind: "selectedTargets",
          targets: params.selectedTargets.map(
            (object, objectIndex): SavedFieldObjectReference => ({
              binding: {
                family: "selectedTargets",
                saveResultAs,
                objectIndex,
                ...(pausedSegment.id === undefined
                  ? {}
                  : { sourceSegmentId: pausedSegment.id }),
              },
              capturedAtStateSeq: params.state.seq,
              object,
              visibility: "public",
            }),
          ),
        });
  return params.resumeSequenceFrameFromLedgers({
    createTrashDecision: params.createUnsupportedTrashDecision,
    effectBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: {
      savedReferences,
      segmentResults: {
        ...frame.segmentResults,
        [params.segmentKey(
          pausedSegment,
          frame.pendingDecision.resumeAtSegmentIndex,
        )]: completedPausedResult,
      },
    },
    state: params.state,
  });
};
