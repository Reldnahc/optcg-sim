import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import { evaluateQueuedEffectCondition } from "../../effect-runtime-conditions.js";
import { appendFailedConditionSpotlightEvent } from "../../runtime/failed-condition-presentation.js";
import { createContinuousRecordsForResolvedEffect } from "../../runtime/continuous/continuous.js";
import { isSupportedContinuousQueueEffect } from "../../runtime/continuous/support.js";
import type { ContinuousQueueEffect } from "../../runtime/continuous/types.js";
import {
  continuousChooseTargetRequest,
  createSequenceSelectTargetsPause,
} from "../target-decisions.js";
import {
  conditionalElseSequencePath,
  conditionalElseSingleEffectPath,
  conditionalThenSequencePath,
  conditionalThenSingleEffectPath,
  toSingleEffectSequence,
} from "../paths.js";
import { sequenceSegmentResultsChanged } from "./composition-results.js";
import { continuousRecordsCurrentlyApply } from "./continuous-application.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SegmentLedgers,
  SequenceEffect,
  SequenceFrameRunResult,
} from "./types.js";

type ConditionalEffect = Extract<Effect, { type: "conditional" }>;

type ContinueNoDecisionSegments = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SequenceEffect | undefined,
  effectBlock: EffectDefinition["effects"][number] | undefined,
  startIndex: number,
  ledgers: SegmentLedgers,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
  incrementStateSeqForDraw: boolean,
  effectPath: readonly string[],
) => SequenceFrameRunResult;

type ConditionalSegmentResult =
  | {
      events: EngineEvent[];
      kind: "continue";
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
  | { ok: false };

export const applyConditionalSequenceSegment = (params: {
  continueNoDecisionSegments: ContinueNoDecisionSegments;
  createTrashDecision: CreateTrashFromHandSequenceDecision;
  effectBlock: EffectDefinition["effects"][number] | undefined;
  effectPath: readonly string[];
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  events: EngineEvent[];
  incrementStateSeqForDraw: boolean;
  index: number;
  ledgers: SegmentLedgers;
  pausedLedgers: SegmentLedgers;
  segment: SequenceEffect["effects"][number] & { effect: ConditionalEffect };
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  state: GameState;
}): ConditionalSegmentResult => {
  const condition = evaluateQueuedEffectCondition(
    params.state,
    params.entry,
    params.segment.effect.if,
    { savedReferences: params.ledgers.savedReferences },
  );
  if (!condition.supported) {
    return { ok: false };
  }
  const branch = condition.passed
    ? params.segment.effect.then
    : params.segment.effect.else;
  if (branch === undefined) {
    const nextState = appendFailedConditionSpotlightEvent({
      effectBlock: params.effectBlock,
      effectPath: params.effectPath,
      entry: params.entry,
      events: params.events,
      sequenceIndex: params.index,
      state: params.state,
    });
    return {
      events: params.events,
      kind: "continue",
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      ok: true,
      state: nextState,
    };
  }
  if (branch.type === "sequence" || !isSupportedContinuousQueueEffect(branch)) {
    return applyConditionalSequenceBranch(params, branch, condition.passed);
  }
  return applyConditionalContinuousBranch(params, branch);
};

const applyConditionalSequenceBranch = (
  params: Parameters<typeof applyConditionalSequenceSegment>[0],
  branch: Effect,
  conditionPassed: boolean,
): ConditionalSegmentResult => {
  const branchSequence =
    branch.type === "sequence" ? branch : toSingleEffectSequence(branch);
  const branchPath = conditionPassed
    ? branch.type === "sequence"
      ? conditionalThenSequencePath(params.effectPath, params.index)
      : conditionalThenSingleEffectPath(params.effectPath, params.index)
    : branch.type === "sequence"
      ? conditionalElseSequencePath(params.effectPath, params.index)
      : conditionalElseSingleEffectPath(params.effectPath, params.index);
  const nested = params.continueNoDecisionSegments(
    params.state,
    params.entry,
    branchSequence,
    params.effectBlock,
    0,
    params.ledgers,
    params.createTrashDecision,
    params.incrementStateSeqForDraw,
    branchPath,
  );
  if (!nested.ok) {
    return { ok: false };
  }
  if (nested.kind === "paused") {
    return {
      events: [...params.events, ...nested.events],
      kind: "paused",
      ok: true,
      state: nested.state,
    };
  }
  const changedState =
    sequenceSegmentResultsChanged(
      nested.ledgers.segmentResults,
      branchSequence,
      branchPath,
    ) || nested.events.length > 0;
  return completeConditionalSegment({
    ...params,
    branchEvents: nested.events,
    changedState,
    ledgers: nested.ledgers,
    state: nested.state,
  });
};

const applyConditionalContinuousBranch = (
  params: Parameters<typeof applyConditionalSequenceSegment>[0],
  branch: ContinuousQueueEffect,
): ConditionalSegmentResult => {
  const request = continuousChooseTargetRequest(branch);
  if (request !== undefined) {
    const paused = createSequenceSelectTargetsPause({
      effectBlockId: params.entry.effectBlockId,
      effectPath: params.effectPath,
      entry: params.entry,
      events: params.events,
      index: params.index,
      ledgers: params.pausedLedgers,
      request,
      state: params.state,
    });
    return paused.ok && paused.kind === "paused" ? paused : { ok: false };
  }
  const records = createContinuousRecordsForResolvedEffect(
    params.state,
    params.entry,
    branch,
    undefined,
    { savedReferences: params.ledgers.savedReferences },
  );
  if (records === null) {
    return { ok: false };
  }
  const nextState =
    records.length === 0
      ? params.state
      : {
          ...params.state,
          continuousEffects: [...params.state.continuousEffects, ...records],
        };
  return completeConditionalSegment({
    ...params,
    branchEvents: [],
    changedState: continuousRecordsCurrentlyApply(nextState, records),
    ledgers: params.ledgers,
    state: nextState,
  });
};

const completeConditionalSegment = (
  params: Parameters<typeof applyConditionalSequenceSegment>[0] & {
    readonly branchEvents: readonly EngineEvent[];
    readonly changedState: boolean;
    readonly state: GameState;
  },
): ConditionalSegmentResult => ({
  events: [...params.events, ...params.branchEvents],
  kind: "continue",
  ledgers: {
    ...params.ledgers,
    segmentResults: {
      ...params.ledgers.segmentResults,
      [params.segmentKey(params.segment, params.index)]: {
        ...params.emptySegmentResult(),
        attempted: true,
        succeeded: true,
        changedState: params.changedState,
      },
    },
  },
  ok: true,
  state: params.state,
});
