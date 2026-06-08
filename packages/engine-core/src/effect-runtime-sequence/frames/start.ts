import type {
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import { appendEffectResolvedForCompletedSequence } from "../frame-events.js";
import { entryWithCompletedSequencePresentation } from "../completed-presentation.js";
import { continueNoDecisionSegments } from "../runner.js";
import { replaceQueueEntry, resolvingEntryFor } from "../segments.js";
import { toSupportedSequenceBlock } from "../support.js";
import {
  consumeOncePerTurn,
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "../../rules/once-per-turn.js";
import {
  createUnsupportedTrashDecision,
  sequenceRuntimeError,
} from "./shared.js";
import type {
  CreateTrashFromHandSequenceDecision,
  SegmentLedgers,
  SequenceFrameDecisionResult,
  SequenceFrameResumeResult,
} from "./types.js";

export const createSupportedSequenceFrameDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameDecisionResult => {
  if (
    effectBlock === undefined ||
    (effectBlock.effect.type !== "sequence" &&
      effectBlock.effect.type !== "choice")
  ) {
    return undefined;
  }
  const supportedBlock = toSupportedSequenceBlock(entry, effectBlock);
  if (supportedBlock === undefined) {
    return { ok: false };
  }

  let nextState = state;
  if (effectBlock.oncePerTurn === true) {
    const oncePerTurnKey = toOncePerTurnKey({
      cardInstanceId: entry.source.instanceId,
      effectId: entry.effectBlockId,
      turnNumber: nextState.turn.globalTurn,
    });
    if (isOncePerTurnUsed(nextState, oncePerTurnKey)) {
      return { ok: false };
    }
    nextState = consumeOncePerTurn(nextState, oncePerTurnKey);
  }

  const resolvingEntry = resolvingEntryFor(entry);
  nextState = replaceQueueEntry(nextState, resolvingEntry);
  const ledgers: SegmentLedgers = { savedReferences: {}, segmentResults: {} };

  const run = continueNoDecisionSegments(
    nextState,
    resolvingEntry,
    supportedBlock.effect,
    0,
    ledgers,
    createTrashDecision,
    true,
  );
  if (!run.ok) {
    return { ok: false };
  }
  if (run.kind === "completed") {
    const completed = appendEffectResolvedForCompletedSequence(
      run.state,
      entryWithCompletedSequencePresentation(
        resolvingEntry,
        run.ledgers.segmentResults,
      ),
      run.events,
    );
    if (!completed.ok) {
      return { error: completed.error, ok: false };
    }
    return {
      events: run.events,
      ok: true,
      state: completed.state,
    };
  }
  return { events: run.events, ok: true, state: run.state };
};

export const continueSupportedSequenceFrameFromSegment = (params: {
  completedSegmentResults: EffectExecutionFrame["segmentResults"];
  effectBlock: EffectDefinition["effects"][number];
  entry: EffectQueueEntry;
  resumePendingDecision?: NonNullable<GameState["pendingDecision"]>;
  startIndex: number;
  state: GameState;
}): SequenceFrameResumeResult => {
  const supportedBlock = toSupportedSequenceBlock(
    params.entry,
    params.effectBlock,
  );
  if (supportedBlock === undefined) {
    return {
      error: sequenceRuntimeError(
        params.entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const stateWithEntry = params.state.effectQueue.some(
    (candidate) => candidate.id === params.entry.id,
  )
    ? params.state
    : {
        ...params.state,
        effectQueue: [...params.state.effectQueue, params.entry],
      };
  const resolvingEntry = resolvingEntryFor(params.entry);
  const run = continueNoDecisionSegments(
    replaceQueueEntry(stateWithEntry, resolvingEntry),
    resolvingEntry,
    supportedBlock.effect,
    params.startIndex,
    { savedReferences: {}, segmentResults: params.completedSegmentResults },
    createUnsupportedTrashDecision,
    false,
  );
  if (!run.ok) {
    return {
      error: sequenceRuntimeError(
        params.entry.effectBlockId,
        "segment-execution-failed",
      ),
      ok: false,
    };
  }
  if (run.kind === "paused") {
    const pendingDecision = run.state.pendingDecision;
    const entry = resolvingEntry;
    const resumePendingDecision = params.resumePendingDecision;
    const state =
      pendingDecision === undefined || resumePendingDecision === undefined
        ? run.state
        : {
            ...run.state,
            effectExecutionFrames: run.state.effectExecutionFrames.map(
              (frame) =>
                frame.queueEntryId === entry.id &&
                frame.pendingDecision.decisionId === pendingDecision.id
                  ? {
                      ...frame,
                      resumePendingDecision,
                    }
                  : frame,
            ),
          };
    return { events: run.events, ok: true, state };
  }
  const completed = appendEffectResolvedForCompletedSequence(
    run.state,
    entryWithCompletedSequencePresentation(
      resolvingEntry,
      run.ledgers.segmentResults,
    ),
    run.events,
  );
  if (!completed.ok) {
    return { error: completed.error, ok: false };
  }
  return {
    events: run.events,
    ok: true,
    state:
      completed.state.pendingDecision === undefined &&
      params.resumePendingDecision !== undefined
        ? { ...completed.state, pendingDecision: params.resumePendingDecision }
        : completed.state,
  };
};
