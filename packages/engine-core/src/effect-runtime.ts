import type {
  CardRef,
  DecisionId,
  EngineError,
  EngineEvent,
  EngineResult,
  EffectQueueEntry,
  GameState,
  QueueEntryId,
  SelectTargetsDecision,
} from "@optcg/types";
type EngineInternalBattleState = NonNullable<GameState["battle"]> & {
  damageProcess?: {
    type?: string;
    remainingDamagePoints: number;
  };
};

import {
  appendEvent,
  type EngineResultOptions,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { reifyCardRef } from "./actions/state.js";
import { createEffectRuntimeQueueProcessing } from "./effect-runtime-queue/processing.js";
import { isSupportedEffectResolvedCustomEffect } from "./effect-runtime-custom-trigger-support.js";
import { resumeSequenceFrameAfterChooseQuantity } from "./effect-runtime-sequence/frames.js";
import { createEffectRuntimeTriggerQueueing } from "./runtime/trigger-queueing/core.js";
import {
  queueDelayedEndOfTurnEffects,
  queueDelayedEventEffects,
  queueDelayedStartOfMainPhaseEffects,
} from "./runtime/trigger-queueing/delayed-effects.js";
import { createSupportedTrashFromHandChoiceDecision } from "./runtime/primitives/trash-from-hand.js";
import { resolveImplementedDslEffectDefinition } from "./effect-runtime-definition-lookup.js";
import { isLifeTriggerQueueEntry } from "./life-trigger/queue-origin.js";

export {
  resolveImplementedDslEffectDefinition,
  type EffectDefinitionLookupErrorDetails,
  type EffectDefinitionLookupFailureReason,
  type ResolveImplementedDslEffectDefinitionResult,
} from "./effect-runtime-definition-lookup.js";

export type { DrawExecutionFailureReason } from "./runtime/primitives/execute.js";
export {
  executeAcceptedFieldRemovalReplacementProcess,
  executeAcceptedSelectedTargetKoReplacementProcess,
} from "./replacement/field-removal-process.js";
export {
  applyReplacementRestTargetDecisionResponse,
  getReplacementRestTargetLegalActions,
  isReplacementRestTargetsDecision,
} from "./replacement/rest-target-decision.js";
export {
  applyReplacementTrashFromHandDecisionResponse,
  getReplacementTrashFromHandLegalActions,
  isReplacementTrashFromHandDecision,
} from "./replacement/trash-from-hand-actions.js";
export type {
  BattleKOTriggerCandidate,
  DetectBattleKOTriggerCandidatesResult,
  OnKOTriggerCandidateDetectionFailureReason,
  OnOpponentAttackTriggerQueueingFailureReason,
  OnPlayTriggerQueueingFailureReason,
  QueueBattleKOTriggersResult,
  WhenAttackingTriggerQueueingFailureReason,
} from "./runtime/trigger-queueing/core.js";
export {
  executeNoChoiceEffectPrimitive,
  isSupportedMainEventTargetKoEffect,
} from "./runtime/primitives/execute.js";

export type PendingRuntimeWorkKind = "effectQueue" | "deferredTriggers";

export interface PendingRuntimeWork {
  kind: PendingRuntimeWorkKind;
  count: number;
}

export interface UnsupportedPendingRuntimeWorkDetails extends PendingRuntimeWork {
  reason: "unsupported-pending-runtime-work";
}

export interface ChooseQuantityRuntimeDecisionRequest {
  playerId: EffectQueueEntry["controllerId"];
  prompt: string;
  mode: "exact" | "upTo";
  min: number;
  max: number;
  visibility?: NonNullable<GameState["pendingDecision"]>["visibility"];
}

interface ChooseQuantityRuntimeErrorDetails {
  reason:
    | "entry-not-pending"
    | "invalid-bounds"
    | "missing-player"
    | "pending-decision-exists";
}

const chooseQuantityRuntimeError = (
  entry: EffectQueueEntry,
  reason: ChooseQuantityRuntimeErrorDetails["reason"],
): EngineError => ({
  type: "effectRuntimeError",
  effectId: entry.effectBlockId,
  details: { reason } satisfies ChooseQuantityRuntimeErrorDetails,
});

export const createChooseQuantityDecisionForQueuedEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  request: ChooseQuantityRuntimeDecisionRequest,
): EngineResult => {
  if (state.pendingDecision !== undefined) {
    return toEngineResult(
      state,
      [],
      [chooseQuantityRuntimeError(entry, "pending-decision-exists")],
    );
  }
  if (
    !state.effectQueue.some(
      (candidate) =>
        candidate.id === entry.id &&
        candidate.effectBlockId === entry.effectBlockId &&
        candidate.state === "pending",
    )
  ) {
    return toEngineResult(
      state,
      [],
      [chooseQuantityRuntimeError(entry, "entry-not-pending")],
    );
  }
  if (state.players[request.playerId] === undefined) {
    return toEngineResult(
      state,
      [],
      [chooseQuantityRuntimeError(entry, "missing-player")],
    );
  }
  if (
    !Number.isInteger(request.min) ||
    !Number.isInteger(request.max) ||
    request.min < 0 ||
    request.min > request.max ||
    (request.mode === "exact" && request.min !== request.max)
  ) {
    return toEngineResult(
      state,
      [],
      [chooseQuantityRuntimeError(entry, "invalid-bounds")],
    );
  }

  const causedBy = {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  } as const;
  const visibility = request.visibility ?? {
    type: "private",
    playerId: request.playerId,
  };
  const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
    id: `decision:chooseQuantity:${String(entry.id)}` as DecisionId,
    type: "chooseQuantity",
    playerId: request.playerId,
    prompt: request.prompt,
    causedBy,
    visibility,
    mode: request.mode,
    min: request.min,
    max: request.max,
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }

  return toEngineResult(
    {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};

export const detectPendingRuntimeWork = (
  state: GameState,
): PendingRuntimeWork | undefined => {
  if (state.effectQueue.length > 0) {
    return {
      kind: "effectQueue",
      count: state.effectQueue.length,
    };
  }
  if (state.deferredTriggers.length > 0) {
    return {
      kind: "deferredTriggers",
      count: state.deferredTriggers.length,
    };
  }
  return undefined;
};

export const isSupportedDamageDeferredEffectQueueState = (
  state: GameState,
): boolean => {
  const battle = state.battle as EngineInternalBattleState | undefined;
  if (
    state.deferredTriggers.length === 0 ||
    battle?.damageProcess?.type !== "multipleDamage" ||
    battle.damageProcess.remainingDamagePoints <= 0
  ) {
    return false;
  }
  return releaseDamageDeferredEffectQueue(state) !== null;
};

const isPublicFieldZone = (zone: CardRef["zone"]): boolean =>
  zone?.zone === "leaderArea" ||
  zone?.zone === "characterArea" ||
  zone?.zone === "stageArea";

const isSupportedDamageDeferredEffectQueueEntry = (
  state: GameState,
  entry: EffectQueueEntry,
): boolean => {
  if (
    entry.causedBy.type !== "effect" ||
    !isLifeTriggerQueueEntry(entry) ||
    entry.triggerEventId === undefined ||
    entry.generation <= 0 ||
    !isPublicFieldZone(entry.source.zone) ||
    !isPublicFieldZone(entry.sourceSnapshot.zone)
  ) {
    return false;
  }
  const resolved = state.cardManifest.cards[entry.source.cardId];
  if (resolved === undefined) {
    return false;
  }
  const lookup = resolveImplementedDslEffectDefinition(
    resolved,
    state.cardManifest,
  );
  if (!lookup.ok) {
    return false;
  }
  const effect = lookup.definition.effects.find(
    (candidate) => candidate.id === entry.effectBlockId,
  );
  return (
    effect !== undefined &&
    effect.sourcePresencePolicy === entry.sourcePresencePolicy &&
    isSupportedEffectResolvedCustomEffect(
      effect,
      `effectResolved:${String(entry.causedBy.effectId)}`,
    )
  );
};

export const releaseDamageDeferredEffectQueue = (
  state: GameState,
): GameState | null => {
  if (state.deferredTriggers.length === 0) {
    return state;
  }
  if (state.deferredTriggers.length !== 1 || state.effectQueue.length !== 1) {
    return null;
  }
  const bucket = state.deferredTriggers[0];
  const entry = state.effectQueue[0];
  if (bucket === undefined || entry === undefined) {
    return null;
  }
  if (
    bucket.releasePolicy !== "afterCurrentProcess" ||
    bucket.triggerIds.length !== 1 ||
    bucket.triggerIds[0] !== String(entry.id) ||
    bucket.timingWindowId !== entry.timingWindowId ||
    bucket.generation !== entry.generation ||
    entry.state !== "pending" ||
    !isSupportedDamageDeferredEffectQueueEntry(state, entry)
  ) {
    return null;
  }
  return {
    ...state,
    deferredTriggers: [],
  };
};

const unsupportedEffectIdByKind: Record<PendingRuntimeWorkKind, string> = {
  effectQueue: "unsupported-effect-queue",
  deferredTriggers: "unsupported-deferred-triggers",
};

const unsupportedPendingRuntimeWorkError = (
  work: PendingRuntimeWork,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: unsupportedEffectIdByKind[work.kind],
  details: {
    reason: "unsupported-pending-runtime-work",
    kind: work.kind,
    count: work.count,
  } satisfies UnsupportedPendingRuntimeWorkDetails,
});

const triggerQueueing = createEffectRuntimeTriggerQueueing({
  resolveImplementedDslEffectDefinition,
  createUnsupportedPendingRuntimeWorkError: unsupportedPendingRuntimeWorkError,
});

export const detectBattleKOTriggerCandidates =
  triggerQueueing.detectBattleKOTriggerCandidates;
export const queueBattleKOTriggers = triggerQueueing.queueBattleKOTriggers;
const queueOnPlayTriggers = triggerQueueing.queueOnPlayTriggers;
const queueMainEventTriggers = triggerQueueing.queueMainEventTriggers;
const queueEndOfYourTurnTriggers = triggerQueueing.queueEndOfYourTurnTriggers;
const queueHandTrashedByEffectTriggers =
  triggerQueueing.queueHandTrashedByEffectTriggers;
const queueOpponentActivationTriggers =
  triggerQueueing.queueOpponentActivationTriggers;
const queueEventReactionTriggers = triggerQueueing.queueEventReactionTriggers;
const queueWhenAttackingTriggers = triggerQueueing.queueWhenAttackingTriggers;
const queueOnOpponentAttackTriggers =
  triggerQueueing.queueOnOpponentAttackTriggers;
const queueEffectResolvedCustomTriggers =
  triggerQueueing.queueEffectResolvedCustomTriggers;

const attackBattleParticipantsRemainPresent = (state: GameState): boolean => {
  const battle = state.battle;
  if (battle === undefined || battle.step !== "attack") {
    return true;
  }
  return (
    reifyCardRef(state, battle.attacker) !== null &&
    reifyCardRef(state, battle.currentTarget) !== null
  );
};

const queueProcessing = createEffectRuntimeQueueProcessing({
  resolveImplementedDslEffectDefinition,
  createUnsupportedPendingRuntimeWorkError: unsupportedPendingRuntimeWorkError,
  queueBattleKOTriggers,
  queueEffectResolvedCustomTriggers,
});

export const failUnsupportedTargetEffectContinuation =
  queueProcessing.failUnsupportedTargetEffectContinuation;
export const continueSelectedTargetEffect = (
  state: GameState,
  decision: SelectTargetsDecision,
  targets: readonly CardRef[],
) => queueProcessing.continueSelectedTargetEffect(state, decision, targets);
export const finalizeSelectedTargetEffectResolution =
  queueProcessing.finalizeSelectedTargetEffectResolution;
export const resumePlaySourceOverflowDecision =
  queueProcessing.resumePlaySourceOverflowDecision;
const processNoChoiceEffectQueue = queueProcessing.processNoChoiceEffectQueue;

const toErrorTuple = (
  errors: readonly EngineError[],
): readonly [EngineError, ...EngineError[]] => {
  const first = errors[0];
  if (first === undefined) {
    return [
      {
        type: "effectRuntimeError",
        effectId: "effect-runtime",
        details: { reason: "empty-runtime-error-list" },
      },
    ];
  }
  return [first, ...errors.slice(1)];
};

export const processDefenderOpponentAttackTiming = (
  state: GameState,
  options: EngineResultOptions = {},
): EngineResult => {
  const queued = queueOnOpponentAttackTriggers(state, options);
  if (queued === undefined) {
    return toEngineResult(state, [], undefined, options);
  }
  if (queued.errors !== undefined) {
    return queued;
  }

  const resolved = processNoChoiceEffectQueue(
    queued.state,
    undefined,
    [],
    options,
  );
  if (resolved.errors !== undefined) {
    return toEngineResult(state, [], toErrorTuple(resolved.errors), options);
  }
  return toEngineResult(
    resolved.state,
    [...queued.events, ...resolved.events],
    undefined,
    options,
  );
};

export const processEffectRuntime = (
  state: GameState,
  options: EngineResultOptions = {},
): EngineResult => {
  const queuedFromOnPlay = queueOnPlayTriggers(state, options);
  if (queuedFromOnPlay !== undefined) {
    return queuedFromOnPlay;
  }
  const queuedFromMainEvent = queueMainEventTriggers(state, options);
  if (queuedFromMainEvent !== undefined) {
    return queuedFromMainEvent;
  }
  const queuedFromDelayedEndOfTurn = queueDelayedEndOfTurnEffects(state);
  if (queuedFromDelayedEndOfTurn !== undefined) {
    return queuedFromDelayedEndOfTurn;
  }
  const queuedFromDelayedStartOfMainPhase =
    queueDelayedStartOfMainPhaseEffects(state);
  if (queuedFromDelayedStartOfMainPhase !== undefined) {
    return queuedFromDelayedStartOfMainPhase;
  }
  const queuedFromEndOfYourTurn = queueEndOfYourTurnTriggers(state, options);
  if (queuedFromEndOfYourTurn !== undefined) {
    return queuedFromEndOfYourTurn;
  }
  const queuedFromWhenAttacking = queueWhenAttackingTriggers(state, options);
  if (queuedFromWhenAttacking !== undefined) {
    return queuedFromWhenAttacking;
  }
  if (attackBattleParticipantsRemainPresent(state)) {
    const queuedFromOnOpponentAttack = queueOnOpponentAttackTriggers(
      state,
      options,
    );
    if (queuedFromOnOpponentAttack !== undefined) {
      return queuedFromOnOpponentAttack;
    }
  }
  const queuedFromEventReaction = queueEventReactionTriggers(state, options);
  if (queuedFromEventReaction !== undefined) {
    return queuedFromEventReaction;
  }
  const queuedFromDelayedEvent = queueDelayedEventEffects(state);
  if (queuedFromDelayedEvent !== undefined) {
    return queuedFromDelayedEvent;
  }
  const queuedFromHandTrash = queueHandTrashedByEffectTriggers(state, options);
  if (queuedFromHandTrash !== undefined) {
    return queuedFromHandTrash;
  }
  const queuedFromOpponentActivation = queueOpponentActivationTriggers(
    state,
    options,
  );
  if (queuedFromOpponentActivation !== undefined) {
    return queuedFromOpponentActivation;
  }
  const resumedSequenceQuantity = resumeSequenceFrameAfterChooseQuantity(
    state,
    createSupportedTrashFromHandChoiceDecision,
  );
  if (resumedSequenceQuantity !== undefined) {
    if (!resumedSequenceQuantity.ok) {
      return toEngineResult(
        state,
        [],
        [resumedSequenceQuantity.error],
        options,
      );
    }
    return toEngineResult(
      resumedSequenceQuantity.state,
      resumedSequenceQuantity.events,
      undefined,
      options,
    );
  }
  if (state.deferredTriggers.length > 0) {
    if (isSupportedDamageDeferredEffectQueueState(state)) {
      return toEngineResult(state, [], undefined, options);
    }
    return toEngineResult(
      state,
      [],
      [
        unsupportedPendingRuntimeWorkError({
          kind: "deferredTriggers",
          count: state.deferredTriggers.length,
        }),
      ],
      options,
    );
  }
  const work = detectPendingRuntimeWork(state);
  if (work === undefined) {
    return toEngineResult(state, [], undefined, options);
  }
  if (work.kind === "effectQueue") {
    return processNoChoiceEffectQueue(state, undefined, [], options);
  }
  return toEngineResult(
    state,
    [],
    [unsupportedPendingRuntimeWorkError(work)],
    options,
  );
};

export const processEffectRuntimeAfterTriggerOrderChoice = (
  state: GameState,
  orderedIds: readonly QueueEntryId[],
  options: EngineResultOptions = {},
): EngineResult => processNoChoiceEffectQueue(state, orderedIds, [], options);

export const processEffectRuntimeAfterOptionalActivationDecline = (
  state: GameState,
  orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
  options: EngineResultOptions = {},
): EngineResult =>
  processNoChoiceEffectQueue(state, orderedCurrentChoiceGroupIds, [], options);

export const processEffectRuntimeAfterOptionalActivationAccept = (
  state: GameState,
  acceptedQueueEntryId: QueueEntryId,
  orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
  options: EngineResultOptions = {},
): EngineResult =>
  processNoChoiceEffectQueue(
    state,
    orderedCurrentChoiceGroupIds,
    [acceptedQueueEntryId],
    options,
  );
