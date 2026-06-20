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
import { getOpponentId } from "../../actions/state.js";
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

const cardRefFromPayload = (value: unknown): CardRef | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const playerId = value["playerId"];
  const instanceId = value["instanceId"];
  const cardId = value["cardId"];
  if (
    typeof playerId !== "string" ||
    typeof instanceId !== "string" ||
    typeof cardId !== "string"
  ) {
    return undefined;
  }
  return {
    instanceId: instanceId as CardRef["instanceId"],
    cardId: cardId as CardRef["cardId"],
    playerId: playerId as PlayerId,
  };
};

const fieldObjectFromBattleCounterpartTrigger = (
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
    event?.type !== "battleEnded" ||
    event.visibility.type !== "public" ||
    !isRecord(event.payload)
  ) {
    return undefined;
  }
  const attacker = cardRefFromPayload(event.payload["attacker"]);
  const target = cardRefFromPayload(event.payload["target"]);
  const opponentId = getOpponentId(state, entry.controllerId);
  const counterpart =
    attacker?.instanceId === entry.source.instanceId &&
    attacker.cardId === entry.source.cardId
      ? target
      : target?.instanceId === entry.source.instanceId &&
          target.cardId === entry.source.cardId
        ? attacker
        : undefined;
  if (counterpart === undefined || counterpart.playerId !== opponentId) {
    return undefined;
  }
  const card = findCardInstance(
    state,
    counterpart.playerId,
    counterpart.instanceId,
  );
  if (
    card === undefined ||
    card.cardId !== counterpart.cardId ||
    card.zone.zone !== "characterArea"
  ) {
    return undefined;
  }
  return {
    instanceId: card.instanceId,
    cardId: card.cardId,
    playerId: counterpart.playerId,
    zone: card.zone,
  };
};

const initialSavedReferences = (
  state: GameState,
  entry: EffectQueueEntry,
): SegmentLedgers["savedReferences"] => {
  const cardPlayedObject = fieldObjectFromCardPlayedTrigger(state, entry);
  const battleCounterpart = fieldObjectFromBattleCounterpartTrigger(
    state,
    entry,
  );
  return {
    ...(cardPlayedObject === undefined
      ? {}
      : {
          "trigger:cardPlayed": {
            kind: "producedObjects" as const,
            objects: [
              {
                binding: {
                  family: "producedObjects" as const,
                  saveResultAs: "trigger:cardPlayed",
                  objectIndex: 0,
                },
                capturedAtStateSeq: state.seq,
                object: cardPlayedObject,
                visibility: "public" as const,
              },
            ],
          },
        }),
    ...(battleCounterpart === undefined
      ? {}
      : {
          "trigger:battleCounterpart": {
            kind: "producedObjects" as const,
            objects: [
              {
                binding: {
                  family: "producedObjects" as const,
                  saveResultAs: "trigger:battleCounterpart",
                  objectIndex: 0,
                },
                capturedAtStateSeq: state.seq,
                object: battleCounterpart,
                visibility: "public" as const,
              },
            ],
          },
        }),
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

const shouldAttemptSequenceFrame = (
  effectBlock: EffectDefinition["effects"][number] | undefined,
  options: { readonly allowSingleEffect: boolean },
): effectBlock is EffectDefinition["effects"][number] =>
  effectBlock !== undefined &&
  (options.allowSingleEffect ||
    effectBlock.effect.type === "sequence" ||
    effectBlock.effect.type === "choice" ||
    effectBlock.effect.type === "returnDon");

export const createSupportedSequenceFrameDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
  options: { readonly allowSingleEffect?: boolean } = {},
): SequenceFrameDecisionResult => {
  if (
    !shouldAttemptSequenceFrame(effectBlock, {
      allowSingleEffect: options.allowSingleEffect === true,
    })
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
  createTrashDecision?: CreateTrashFromHandSequenceDecision;
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
    params.createTrashDecision ?? createUnsupportedTrashDecision,
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
