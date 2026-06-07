import type {
  ActiveEffectTextPresentation,
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  GameState,
} from "@optcg/types";

import { appendEffectResolvedForCompletedSequence } from "./frame-events.js";
import { entryWithCompletedSequencePresentation } from "./completed-presentation.js";
import { removeFrame, replaceQueueEntry } from "./segments.js";
import {
  activeSpanIdsForSearchRevealRemaining,
  activeSpanIdsForSequenceIndex,
  activeSpanIdsWithoutCost,
} from "../runtime/effect-presentation.js";
import {
  conditionalParentForPath,
  isRootSequencePath,
  resolveSequenceForPath,
  segmentKeyForPath,
} from "./paths.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SegmentLedgers,
  SequenceFrameResumeResult,
} from "./runner.js";
import {
  continueNoDecisionSegments,
  emptySegmentResult,
  sequenceRuntimeError,
} from "./runner.js";
import type { SupportedSequenceBlock } from "./support.js";

type SequenceFrameRunResult =
  | {
      events: EngineEvent[];
      kind: "completed";
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

const searchRevealOrderDecisionPrefix = "decision:orderCards:search-reveal:";
const payCostDecisionPrefix = "decision:payCost:sequence:";
const rootSequenceEffectPath = ["effect", "sequence"] as const;

export const findFrameQueueEntry = (
  state: GameState,
  frame: EffectExecutionFrame,
): EffectQueueEntry | undefined =>
  state.effectQueue.find(
    (entry) =>
      entry.id === frame.queueEntryId &&
      entry.effectBlockId === frame.effectBlockId,
  );

export const findSequenceEffectBlock = (
  state: GameState,
  entry: EffectQueueEntry,
): EffectDefinition["effects"][number] | undefined => {
  const card = state.cardManifest.cards[entry.source.cardId];
  const definitionId = card?.support.effectDefinitionId;
  if (
    card === undefined ||
    card.support.status !== "implemented-dsl" ||
    definitionId === undefined
  ) {
    return undefined;
  }
  return state.cardManifest.effectDefinitions?.[definitionId]?.effects.find(
    (effect) => effect.id === entry.effectBlockId,
  );
};

const topLevelSequenceIndexForFrame = (
  frame: EffectExecutionFrame,
): number | undefined => {
  if (
    frame.effectPath.length < rootSequenceEffectPath.length ||
    !rootSequenceEffectPath.every(
      (part, index) => frame.effectPath[index] === part,
    )
  ) {
    return undefined;
  }
  if (frame.effectPath.length === rootSequenceEffectPath.length) {
    return frame.pendingDecision.resumeAtSegmentIndex;
  }
  const topLevelIndex = Number(frame.effectPath[rootSequenceEffectPath.length]);
  return Number.isSafeInteger(topLevelIndex) && topLevelIndex >= 0
    ? topLevelIndex
    : undefined;
};

const narrowedActiveSpanIdsForCompletedFrame = (
  entry: EffectQueueEntry,
  frame: EffectExecutionFrame,
): ActiveEffectTextPresentation["activeSpanIds"] | undefined => {
  const presentation = entry.presentation;
  if (presentation === undefined) {
    return undefined;
  }
  if (frame.pendingDecision.decisionId.startsWith(payCostDecisionPrefix)) {
    return activeSpanIdsWithoutCost(presentation.activeSpanIds);
  }
  const searchPhaseSpanIds = frame.pendingDecision.decisionId.startsWith(
    searchRevealOrderDecisionPrefix,
  )
    ? activeSpanIdsForSearchRevealRemaining(presentation.activeSpanIds)
    : undefined;
  const topLevelIndex = topLevelSequenceIndexForFrame(frame);
  const sequenceSpanIds =
    topLevelIndex === undefined
      ? undefined
      : activeSpanIdsForSequenceIndex(
          presentation.activeSpanIds,
          topLevelIndex,
        );
  const narrowed = [...(searchPhaseSpanIds ?? []), ...(sequenceSpanIds ?? [])];
  return narrowed.length === 0 ? undefined : narrowed;
};

const entryWithCompletedFramePresentation = (
  entry: EffectQueueEntry,
  frame: EffectExecutionFrame,
): EffectQueueEntry => {
  const activeSpanIds = narrowedActiveSpanIdsForCompletedFrame(entry, frame);
  return activeSpanIds === undefined || entry.presentation === undefined
    ? entry
    : {
        ...entry,
        presentation: {
          ...entry.presentation,
          activeSpanIds,
        },
      };
};

const continueParentSequencesAfterNestedCompletion = (params: {
  createTrashDecision: CreateTrashFromHandSequenceDecision;
  effectBlock: SupportedSequenceBlock;
  entry: EffectQueueEntry;
  events: EngineEvent[];
  ledgers: SegmentLedgers;
  state: GameState;
  completedPath: readonly string[];
}): SequenceFrameRunResult => {
  let completedPath = [...params.completedPath];
  let nextState = params.state;
  let nextLedgers = params.ledgers;
  const events = [...params.events];
  while (!isRootSequencePath(completedPath)) {
    const parent = conditionalParentForPath(completedPath);
    if (parent === undefined) {
      return { ok: false };
    }
    const parentEffect = resolveSequenceForPath(
      params.effectBlock.effect,
      parent.parentPath,
    );
    const parentSegment = parentEffect?.effects[parent.parentIndex];
    if (parentSegment === undefined) {
      return { ok: false };
    }
    nextLedgers = {
      ...nextLedgers,
      segmentResults: {
        ...nextLedgers.segmentResults,
        [segmentKeyForPath(
          parent.parentPath,
          parentSegment,
          parent.parentIndex,
        )]: {
          ...emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: events.length > 0,
        },
      },
    };
    const continued = continueNoDecisionSegments(
      nextState,
      params.entry,
      parentEffect,
      parent.parentIndex + 1,
      nextLedgers,
      params.createTrashDecision,
      false,
      parent.parentPath,
    );
    if (!continued.ok) {
      return { ok: false };
    }
    events.push(...continued.events);
    if (continued.kind === "paused") {
      return {
        events,
        kind: "paused",
        ok: true,
        state: continued.state,
      };
    }
    nextState = continued.state;
    nextLedgers = continued.ledgers;
    completedPath = parent.parentPath;
  }
  return {
    events,
    kind: "completed",
    ledgers: nextLedgers,
    ok: true,
    state: nextState,
  };
};

export const resumeSequenceFrameFromLedgers = (params: {
  createTrashDecision: CreateTrashFromHandSequenceDecision;
  effectBlock: SupportedSequenceBlock;
  entry: EffectQueueEntry;
  finalizeCompleted: boolean;
  frame: EffectExecutionFrame;
  ledgers: SegmentLedgers;
  state: GameState;
}): SequenceFrameResumeResult => {
  const resumedEntry = entryWithCompletedFramePresentation(
    params.entry,
    params.frame,
  );
  const resumedState =
    resumedEntry === params.entry
      ? params.state
      : replaceQueueEntry(params.state, resumedEntry);
  const continued = continueNoDecisionSegments(
    resumedState,
    resumedEntry,
    resolveSequenceForPath(params.effectBlock.effect, params.frame.effectPath),
    params.frame.nextSegmentIndex,
    params.ledgers,
    params.createTrashDecision,
    false,
    params.frame.effectPath,
  );
  if (!continued.ok) {
    return {
      error: sequenceRuntimeError(
        params.entry.effectBlockId,
        "segment-execution-failed",
      ),
      ok: false,
    };
  }
  if (continued.kind === "paused") {
    return {
      events: continued.events,
      ok: true,
      state: continued.state,
    };
  }

  const events = [...continued.events];
  let completedState = removeFrame(continued.state, params.frame);
  const completed = continueParentSequencesAfterNestedCompletion({
    createTrashDecision: params.createTrashDecision,
    effectBlock: params.effectBlock,
    entry: resumedEntry,
    events,
    ledgers: continued.ledgers,
    state: completedState,
    completedPath: params.frame.effectPath,
  });
  if (!completed.ok) {
    return {
      error: sequenceRuntimeError(
        params.entry.effectBlockId,
        "segment-execution-failed",
      ),
      ok: false,
    };
  }
  if (completed.kind === "paused") {
    return {
      events: completed.events,
      ok: true,
      state: completed.state,
    };
  }
  events.splice(0, events.length, ...completed.events);
  completedState = completed.state;
  if (params.finalizeCompleted) {
    const completedEntry = entryWithCompletedSequencePresentation(
      resumedEntry,
      completed.ledgers.segmentResults,
    );
    const finalized = appendEffectResolvedForCompletedSequence(
      completedState,
      completedEntry,
      events,
    );
    if (!finalized.ok) {
      return {
        error: finalized.error,
        ok: false,
      };
    }
    completedState = finalized.state;
  }
  if (
    completedState.pendingDecision === undefined &&
    params.frame.resumePendingDecision !== undefined
  ) {
    completedState = {
      ...completedState,
      pendingDecision: params.frame.resumePendingDecision,
    };
  }
  return {
    events,
    ok: true,
    state: completedState,
  };
};
