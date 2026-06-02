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
  Target,
} from "@optcg/types";

import { appendEvent, toDecisionId, toStateSeq } from "../action-results.js";
import { createContinuousRecordsForResolvedEffect } from "../runtime/continuous/continuous.js";
import { restFieldObjects } from "./saved-field-object.js";
import { resolvePlayerId } from "../runtime/primitives/execute.js";
import {
  frameForPausedSequenceDecision,
  stateWithPausedSequenceFrame,
} from "./frame-decisions.js";
import { saveReference } from "./segments.js";
import {
  toSupportedSequenceBlock,
  type SupportedSequenceSegment,
} from "./support.js";
import { resolvePublicTargetCandidatesForRequest } from "../selection/candidates.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type ContinuousResolvedEffect = Extract<
  Effect,
  {
    type:
      | "modifyPower"
      | "giveKeyword"
      | "modifyCost"
      | "invalidateEffects"
      | "cannotBecomeActive"
      | "cannotAttack"
      | "cannotBlock";
  }
>;
type ContinuousEffectWithChooseTarget = ContinuousResolvedEffect & {
  readonly target: Extract<Target, { type: "choose" | "chooseFromZones" }>;
};
type ConditionalContinuousChooseTargetEffect = Extract<
  Effect,
  { type: "conditional" }
> & {
  readonly then: ContinuousEffectWithChooseTarget;
};

const rootSequenceEffectPath = ["effect", "sequence"] as const;

const isRootSequencePath = (effectPath: readonly string[]): boolean =>
  effectPath.length === rootSequenceEffectPath.length &&
  effectPath.every((part, index) => part === rootSequenceEffectPath[index]);

const segmentKeyForPath = (
  effectPath: readonly string[],
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
): ((segment: SequenceEffect["effects"][number], index: number) => string) => {
  if (isRootSequencePath(effectPath)) {
    return segmentKey;
  }
  return (segment, index): string =>
    `${effectPath.join(".")}:${segmentKey(segment, index)}`;
};

const resolveSequenceForPath = (
  effect: SequenceEffect,
  effectPath: readonly string[],
): SequenceEffect | undefined => {
  if (!isRootSequencePath(effectPath.slice(0, rootSequenceEffectPath.length))) {
    return undefined;
  }
  let current: SequenceEffect = effect;
  let index = rootSequenceEffectPath.length;
  while (index < effectPath.length) {
    const segmentIndex = Number(effectPath[index]);
    if (
      !Number.isSafeInteger(segmentIndex) ||
      effectPath[index + 1] !== "then" ||
      effectPath[index + 2] !== "sequence"
    ) {
      return undefined;
    }
    const segment = current.effects[segmentIndex];
    if (
      segment === undefined ||
      segment.effect.type !== "conditional" ||
      segment.effect.then.type !== "sequence"
    ) {
      return undefined;
    }
    current = segment.effect.then;
    index += 3;
  }
  return current;
};

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

const isContinuousEffectWithChooseTarget = (
  effect: unknown,
): effect is ContinuousEffectWithChooseTarget => {
  if (typeof effect !== "object" || effect === null) {
    return false;
  }
  const candidate = effect as {
    readonly target?: unknown;
    readonly type?: unknown;
  };
  const target = candidate.target;
  return (
    (candidate.type === "modifyPower" ||
      candidate.type === "giveKeyword" ||
      candidate.type === "modifyCost" ||
      candidate.type === "invalidateEffects" ||
      candidate.type === "cannotBecomeActive" ||
      candidate.type === "cannotAttack" ||
      candidate.type === "cannotBlock") &&
    typeof target === "object" &&
    target !== null &&
    ((target as { readonly type?: unknown }).type === "choose" ||
      (target as { readonly type?: unknown }).type === "chooseFromZones")
  );
};

const isConditionalContinuousChooseTargetEffect = (
  effect: unknown,
): effect is ConditionalContinuousChooseTargetEffect => {
  if (typeof effect !== "object" || effect === null) {
    return false;
  }
  const candidate = effect as {
    readonly then?: unknown;
    readonly type?: unknown;
  };
  return (
    candidate.type === "conditional" &&
    isContinuousEffectWithChooseTarget(candidate.then)
  );
};

const isRestEffectWithChooseTarget = (
  effect: unknown,
): effect is Extract<Effect, { type: "rest" }> & {
  readonly target: Extract<Target, { type: "choose" | "chooseFromZones" }>;
} => {
  if (typeof effect !== "object" || effect === null) {
    return false;
  }
  const candidate = effect as {
    readonly target?: unknown;
    readonly type?: unknown;
  };
  const target = candidate.target;
  return (
    candidate.type === "rest" &&
    typeof target === "object" &&
    target !== null &&
    ((target as { readonly type?: unknown }).type === "choose" ||
      (target as { readonly type?: unknown }).type === "chooseFromZones")
  );
};

export const applySelectTargetsSequenceSegment = (params: {
  entry: EffectQueueEntry;
  emptySegmentResult: () => SequenceSegmentResult;
  effectPath?: readonly string[];
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
    effectPath = rootSequenceEffectPath,
    events,
    index,
    nextLedgers,
    nextState,
    segment,
    segmentKey,
  } = params;
  const candidates = resolvePublicTargetCandidatesForRequest(
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
  if (
    candidates.candidates.length === 0 &&
    segment.effect.request.min === 0 &&
    segment.effect.request.allowFewerIfUnavailable
  ) {
    const savedReferences =
      segment.saveResultAs === undefined
        ? nextLedgers.savedReferences
        : saveReference(nextLedgers.savedReferences, segment, {
            kind: "selectedTargets",
            targets: [],
          });
    return {
      kind: "continued",
      ledgers: {
        savedReferences,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [segmentKey(segment, index)]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
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
    effectPath: [...effectPath],
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
  const sequence = resolveSequenceForPath(effectBlock.effect, frame.effectPath);
  const pausedSegment =
    sequence?.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (pausedSegment === undefined) {
    return {
      error: params.sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }

  if (isContinuousEffectWithChooseTarget(pausedSegment.effect)) {
    const records = createContinuousRecordsForResolvedEffect(
      params.state,
      entry,
      pausedSegment.effect,
      params.selectedTargets,
    );
    if (records === null) {
      return {
        error: params.sequenceRuntimeError(
          entry.effectBlockId,
          "segment-execution-failed",
        ),
        ok: false,
      };
    }
    const scopedSegmentKey = segmentKeyForPath(
      frame.effectPath,
      params.segmentKey,
    );
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
          [scopedSegmentKey(
            pausedSegment,
            frame.pendingDecision.resumeAtSegmentIndex,
          )]: {
            ...params.emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: records.length > 0,
            selectedTargets: [...params.selectedTargets],
          },
        },
      },
      state:
        records.length === 0
          ? params.state
          : {
              ...params.state,
              continuousEffects: [
                ...params.state.continuousEffects,
                ...records,
              ],
            },
    });
  }

  if (isConditionalContinuousChooseTargetEffect(pausedSegment.effect)) {
    const records = createContinuousRecordsForResolvedEffect(
      params.state,
      entry,
      pausedSegment.effect.then,
      params.selectedTargets,
    );
    if (records === null) {
      return {
        error: params.sequenceRuntimeError(
          entry.effectBlockId,
          "segment-execution-failed",
        ),
        ok: false,
      };
    }
    const scopedSegmentKey = segmentKeyForPath(
      frame.effectPath,
      params.segmentKey,
    );
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
          [scopedSegmentKey(
            pausedSegment,
            frame.pendingDecision.resumeAtSegmentIndex,
          )]: {
            ...params.emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: records.length > 0,
            selectedTargets: [...params.selectedTargets],
          },
        },
      },
      state:
        records.length === 0
          ? params.state
          : {
              ...params.state,
              continuousEffects: [
                ...params.state.continuousEffects,
                ...records,
              ],
            },
    });
  }

  if (isRestEffectWithChooseTarget(pausedSegment.effect)) {
    const rested = restFieldObjects(params.state, params.selectedTargets, {
      sourceKind: "cardEffect",
      sourceControllerId: entry.controllerId,
      sourceCardCategory: entry.sourceSnapshot.category,
    });
    const scopedSegmentKey = segmentKeyForPath(
      frame.effectPath,
      params.segmentKey,
    );
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
          [scopedSegmentKey(
            pausedSegment,
            frame.pendingDecision.resumeAtSegmentIndex,
          )]: {
            ...params.emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: rested.changed,
            selectedTargets: [...params.selectedTargets],
          },
        },
      },
      state: rested.changed
        ? { ...rested.state, seq: toStateSeq(rested.state.seq + 1) }
        : rested.state,
    });
  }

  if (pausedSegment.effect.type !== "selectTargets") {
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
  const scopedSegmentKey = segmentKeyForPath(
    frame.effectPath,
    params.segmentKey,
  );
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
        [scopedSegmentKey(
          pausedSegment,
          frame.pendingDecision.resumeAtSegmentIndex,
        )]: completedPausedResult,
      },
    },
    state: params.state,
  });
};
