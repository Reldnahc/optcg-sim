import type {
  CardRef,
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendEffectResolvedForCompletedSequence } from "../frame-events.js";
import { entryWithCompletedSequencePresentation } from "../completed-presentation.js";
import { continueNoDecisionSegments } from "../runner.js";
import { replaceQueueEntry, resolvingEntryFor } from "../segments.js";
import {
  toSupportedSequenceBlock,
  type SupportedSequenceBlock,
} from "../support.js";
import { findCardInstance } from "../../effect-runtime-trigger-source-lookup.js";
import {
  canAdmitOncePerTurnEffect,
  consumeOncePerTurnForQueueEntry,
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const fieldObjectFromCardPlayedTrigger = (
  state: GameState,
  entry: EffectQueueEntry,
): CardRef | undefined => {
  if (entry.triggerEventId === undefined) {
    return undefined;
  }
  const event = state.eventJournal.find(
    (candidate) => candidate.id === entry.triggerEventId,
  );
  if (
    event?.type !== "cardPlayed" ||
    event.visibility.type !== "public" ||
    !isRecord(event.payload)
  ) {
    return undefined;
  }
  const playerId = event.payload["playerId"];
  const instanceId = event.payload["instanceId"];
  const cardId = event.payload["cardId"];
  if (
    typeof playerId !== "string" ||
    typeof instanceId !== "string" ||
    typeof cardId !== "string"
  ) {
    return undefined;
  }
  const card = findCardInstance(state, playerId as PlayerId, instanceId);
  if (
    card === undefined ||
    card.cardId !== cardId ||
    (card.zone.zone !== "leaderArea" &&
      card.zone.zone !== "characterArea" &&
      card.zone.zone !== "stageArea")
  ) {
    return undefined;
  }
  return {
    instanceId: card.instanceId,
    cardId: card.cardId,
    playerId: playerId as PlayerId,
    zone: card.zone,
  };
};

const initialSavedReferences = (
  state: GameState,
  entry: EffectQueueEntry,
): SegmentLedgers["savedReferences"] => {
  const object = fieldObjectFromCardPlayedTrigger(state, entry);
  if (object === undefined) {
    return {};
  }
  return {
    "trigger:cardPlayed": {
      kind: "producedObjects",
      objects: [
        {
          binding: {
            family: "producedObjects",
            saveResultAs: "trigger:cardPlayed",
            objectIndex: 0,
          },
          capturedAtStateSeq: state.seq,
          object,
          visibility: "public",
        },
      ],
    },
  };
};

const shouldDeferInitialOncePerTurnUse = (
  effectBlock: SupportedSequenceBlock,
): boolean => {
  const firstSegment = effectBlock.effect.effects[0];
  if (firstSegment === undefined) {
    return false;
  }
  if (firstSegment.optional === true) {
    return true;
  }
  return firstSegment.effect.type === "payCost";
};

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
    if (!canAdmitOncePerTurnEffect(nextState, entry, supportedBlock)) {
      return { ok: false };
    }
    if (!shouldDeferInitialOncePerTurnUse(supportedBlock)) {
      nextState = consumeOncePerTurnForQueueEntry(
        nextState,
        entry,
        supportedBlock,
      );
    }
  }

  const resolvingEntry = resolvingEntryFor(entry);
  nextState = replaceQueueEntry(nextState, resolvingEntry);
  const ledgers: SegmentLedgers = {
    savedReferences: initialSavedReferences(nextState, resolvingEntry),
    segmentResults: {},
  };

  const run = continueNoDecisionSegments(
    nextState,
    resolvingEntry,
    supportedBlock.effect,
    effectBlock,
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
    params.effectBlock,
    params.startIndex,
    {
      savedReferences: initialSavedReferences(params.state, resolvingEntry),
      segmentResults: params.completedSegmentResults,
    },
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
