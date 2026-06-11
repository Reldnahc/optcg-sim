import type {
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SavedFieldObjectReference,
  SequenceSegmentResult,
} from "@optcg/types";

import {
  forEachSavedTargetItemPath,
  segmentKeyForPath,
  toSingleEffectSequence,
} from "../paths.js";
import { sequenceSegmentResultsChanged } from "./composition-results.js";
import { emptySegmentResult } from "./results.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SegmentLedgers,
  SequenceEffect,
  SequenceFrameRunResult,
} from "./types.js";

type ContinueNoDecisionSegments = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SequenceEffect | undefined,
  startIndex: number,
  ledgers: SegmentLedgers,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
  incrementStateSeqForDraw: boolean,
  effectPath: readonly string[],
) => SequenceFrameRunResult;

const savedReferenceForLoopItem = (params: {
  currentSaveAs: string;
  item: SavedFieldObjectReference;
  stateSeq: GameState["seq"];
}): SavedFieldObjectReference => ({
  binding: {
    family: "forEachSavedTarget",
    saveResultAs: params.currentSaveAs,
  },
  capturedAtStateSeq: params.stateSeq,
  object: params.item.object,
  visibility: "public",
});

const completedLoopTargets = (
  result: SequenceSegmentResult | undefined,
): number => result?.selectedTargets.length ?? 0;

const itemSequenceCompleted = (
  segmentResults: SegmentLedgers["segmentResults"],
  sequence: SequenceEffect,
  effectPath: readonly string[],
): boolean => {
  const lastIndex = sequence.effects.length - 1;
  const lastSegment = sequence.effects[lastIndex];
  if (lastSegment === undefined) {
    return false;
  }
  const result =
    segmentResults[segmentKeyForPath(effectPath, lastSegment, lastIndex)];
  return result?.attempted === true;
};

const markLoopItemCompleted = (params: {
  childSequence: SequenceEffect;
  completedCount: number;
  itemPath: readonly string[];
  ledgers: SegmentLedgers;
  loopKey: string;
  loopTargets: readonly SavedFieldObjectReference[];
  previousChangedState: boolean;
}): SegmentLedgers => ({
  ...params.ledgers,
  segmentResults: {
    ...params.ledgers.segmentResults,
    [params.loopKey]: {
      ...emptySegmentResult(),
      attempted: true,
      succeeded: params.completedCount + 1 === params.loopTargets.length,
      changedState:
        params.previousChangedState ||
        sequenceSegmentResultsChanged(
          params.ledgers.segmentResults,
          params.childSequence,
          params.itemPath,
        ),
      selectedTargets: params.loopTargets
        .slice(0, params.completedCount + 1)
        .map((target) => target.object),
    },
  },
});

export const applyForEachSavedTargetSegment = (params: {
  continueNoDecisionSegments: ContinueNoDecisionSegments;
  createTrashDecision: CreateTrashFromHandSequenceDecision;
  effectPath: readonly string[];
  entry: EffectQueueEntry;
  events: readonly EngineEvent[];
  incrementStateSeqForDraw: boolean;
  index: number;
  ledgers: SegmentLedgers;
  segment: SequenceEffect["effects"][number] & {
    effect: Extract<Effect, { type: "forEachSavedTarget" }>;
  };
  segmentKey: string;
  state: GameState;
}): SequenceFrameRunResult => {
  const savedSelection =
    params.ledgers.savedReferences[params.segment.effect.selection];
  if (savedSelection?.kind !== "selectedTargets") {
    return { ok: false };
  }
  const loopTargets = savedSelection.targets;
  let nextState = params.state;
  let nextLedgers = params.ledgers;
  let completedCount = completedLoopTargets(
    nextLedgers.segmentResults[params.segmentKey],
  );
  if (completedCount > loopTargets.length) {
    return { ok: false };
  }
  const loopEvents: EngineEvent[] = [];
  const childSequence =
    params.segment.effect.effect.type === "sequence"
      ? params.segment.effect.effect
      : toSingleEffectSequence(params.segment.effect.effect);
  while (completedCount < loopTargets.length) {
    const current = loopTargets[completedCount];
    if (current === undefined) {
      return { ok: false };
    }
    const itemPath = forEachSavedTargetItemPath(
      params.effectPath,
      params.index,
      completedCount,
    );
    const previousChangedState =
      nextLedgers.segmentResults[params.segmentKey]?.changedState ?? false;
    if (
      itemSequenceCompleted(nextLedgers.segmentResults, childSequence, itemPath)
    ) {
      nextLedgers = markLoopItemCompleted({
        childSequence,
        completedCount,
        itemPath,
        ledgers: nextLedgers,
        loopKey: params.segmentKey,
        loopTargets,
        previousChangedState,
      });
      completedCount += 1;
      continue;
    }
    const childRun = params.continueNoDecisionSegments(
      nextState,
      params.entry,
      childSequence,
      0,
      {
        segmentResults: nextLedgers.segmentResults,
        savedReferences: {
          ...nextLedgers.savedReferences,
          [params.segment.effect.saveCurrentAs]: {
            kind: "selectedTargets",
            targets: [
              savedReferenceForLoopItem({
                currentSaveAs: params.segment.effect.saveCurrentAs,
                item: current,
                stateSeq: nextState.seq,
              }),
            ],
          },
        },
      },
      params.createTrashDecision,
      params.incrementStateSeqForDraw,
      itemPath,
    );
    if (!childRun.ok) {
      return { ok: false };
    }
    if (childRun.kind === "paused") {
      return {
        events: [...params.events, ...loopEvents, ...childRun.events],
        kind: "paused",
        ok: true,
        state: childRun.state,
      };
    }
    nextState = childRun.state;
    nextLedgers = markLoopItemCompleted({
      childSequence,
      completedCount,
      itemPath,
      ledgers: childRun.ledgers,
      loopKey: params.segmentKey,
      loopTargets,
      previousChangedState: previousChangedState || childRun.events.length > 0,
    });
    loopEvents.push(...childRun.events);
    completedCount += 1;
  }
  return {
    events: loopEvents,
    kind: "completed",
    ledgers: {
      ...nextLedgers,
      segmentResults: {
        ...nextLedgers.segmentResults,
        [params.segmentKey]: {
          ...emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState:
            nextLedgers.segmentResults[params.segmentKey]?.changedState ===
            true,
          selectedTargets: loopTargets.map((target) => target.object),
        },
      },
    },
    ok: true,
    state: nextState,
  };
};
