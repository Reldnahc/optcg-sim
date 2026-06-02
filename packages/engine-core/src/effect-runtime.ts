import type {
  CardSupportStatus,
  CardRef,
  DecisionId,
  EffectDefinition,
  EngineError,
  EngineEvent,
  EngineResult,
  EffectQueueEntry,
  GameState,
  MatchCardManifest,
  QueueEntryId,
  ResolvedCard,
  SelectTargetsDecision,
} from "@optcg/types";
type EngineInternalBattleState = NonNullable<GameState["battle"]> & {
  damageProcess?: {
    type?: string;
    remainingDamagePoints: number;
  };
};

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { createEffectRuntimeQueueProcessing } from "./effect-runtime-queue/processing.js";
import { isSupportedEffectResolvedCustomDrawEffect } from "./runtime/primitives/execute.js";
import { resumeSequenceFrameAfterChooseQuantity } from "./effect-runtime-sequence/frames.js";
import { createEffectRuntimeTriggerQueueing } from "./runtime/trigger-queueing/core.js";
import { createSupportedTrashFromHandChoiceDecision } from "./runtime/primitives/trash-from-hand.js";

export type { DrawExecutionFailureReason } from "./runtime/primitives/execute.js";
export { executeAcceptedSelectedTargetKoReplacementProcess } from "./effect-runtime-ko-replacement-process.js";
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
  isSupportedNoChoiceOnKODrawEffect,
  isSupportedNoChoiceMainEventDrawEffect,
  isSupportedNoChoiceOnOpponentAttackDrawEffect,
  isSupportedNoChoiceOnPlayDrawEffect,
  isSupportedNoChoiceWhenAttackingDrawEffect,
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

export type EffectDefinitionLookupFailureReason =
  | "unsupported-support-status"
  | "implemented-custom-status"
  | "unexpected-vanilla-effect-definition"
  | "missing-effect-definition-id"
  | "missing-effect-definition"
  | "definition-card-id-mismatch"
  | "definition-status-mismatch"
  | "support-card-data-version-mismatch"
  | "rules-version-mismatch"
  | "source-text-hash-mismatch"
  | "definition-version-mismatch"
  | "untested-support-metadata"
  | "untested-definition-metadata"
  | "unreviewed-definition-metadata";

export interface EffectDefinitionLookupErrorDetails {
  reason: EffectDefinitionLookupFailureReason;
  supportStatus: CardSupportStatus;
}

export type ResolveImplementedDslEffectDefinitionResult =
  | { ok: true; definition: EffectDefinition }
  | { ok: false; error: EngineError };

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
    !String(entry.causedBy.queueEntryId).startsWith(
      "queue-entry:life-trigger:",
    ) ||
    !String(entry.timingWindowId).startsWith("timing-window:life-trigger:") ||
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
    isSupportedEffectResolvedCustomDrawEffect(
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

const asLookupError = (
  reason: EffectDefinitionLookupFailureReason,
  supportStatus: CardSupportStatus,
): ResolveImplementedDslEffectDefinitionResult => ({
  ok: false,
  error: {
    type: "effectRuntimeError",
    effectId: "effect-definition-lookup",
    details: {
      reason,
      supportStatus,
    } satisfies EffectDefinitionLookupErrorDetails,
  },
});

const hasHumanReviewMetadata = (definition: EffectDefinition): boolean =>
  definition.metadata.reviewer !== undefined ||
  (definition.metadata.reviewedBy !== undefined &&
    definition.metadata.reviewedAt !== undefined);

export const resolveImplementedDslEffectDefinition = (
  card: ResolvedCard,
  manifest: MatchCardManifest,
): ResolveImplementedDslEffectDefinitionResult => {
  const support = card.support;

  if (support.status === "implemented-custom") {
    return asLookupError("implemented-custom-status", support.status);
  }
  if (support.status === "vanilla-confirmed") {
    if (support.effectDefinitionId !== undefined) {
      return asLookupError(
        "unexpected-vanilla-effect-definition",
        support.status,
      );
    }
    return asLookupError("unsupported-support-status", support.status);
  }
  if (support.status !== "implemented-dsl") {
    return asLookupError("unsupported-support-status", support.status);
  }
  if (support.effectDefinitionId === undefined) {
    return asLookupError("missing-effect-definition-id", support.status);
  }
  if (!support.tested) {
    return asLookupError("untested-support-metadata", support.status);
  }
  if (support.cardDataVersion !== manifest.cardDataVersion) {
    return asLookupError("support-card-data-version-mismatch", support.status);
  }

  const registry = manifest.effectDefinitions;
  if (registry === undefined) {
    return asLookupError("missing-effect-definition", support.status);
  }
  const definition = registry[support.effectDefinitionId];
  if (definition === undefined) {
    return asLookupError("missing-effect-definition", support.status);
  }
  if (definition.cardId !== support.cardId) {
    return asLookupError("definition-card-id-mismatch", support.status);
  }
  if (definition.implementationStatus !== support.status) {
    return asLookupError("definition-status-mismatch", support.status);
  }
  if (definition.metadata.rulesVersion !== support.rulesVersion) {
    return asLookupError("rules-version-mismatch", support.status);
  }
  if (definition.metadata.sourceTextHash !== support.sourceTextHash) {
    return asLookupError("source-text-hash-mismatch", support.status);
  }
  if (
    definition.metadata.effectDefinitionsVersion !==
    manifest.effectDefinitionsVersion
  ) {
    return asLookupError("definition-version-mismatch", support.status);
  }
  if (!definition.metadata.tested) {
    return asLookupError("untested-definition-metadata", support.status);
  }
  if (!hasHumanReviewMetadata(definition)) {
    return asLookupError("unreviewed-definition-metadata", support.status);
  }

  return { ok: true, definition };
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
const queueLifeRemovedTriggers = triggerQueueing.queueLifeRemovedTriggers;
const queueOpponentActivationTriggers =
  triggerQueueing.queueOpponentActivationTriggers;
const queueWhenAttackingTriggers = triggerQueueing.queueWhenAttackingTriggers;
const queueOnOpponentAttackTriggers =
  triggerQueueing.queueOnOpponentAttackTriggers;
const queueEffectResolvedCustomTriggers =
  triggerQueueing.queueEffectResolvedCustomTriggers;

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
): EngineResult => {
  const queued = queueOnOpponentAttackTriggers(state);
  if (queued === undefined) {
    return toEngineResult(state, []);
  }
  if (queued.errors !== undefined) {
    return queued;
  }

  const resolved = processNoChoiceEffectQueue(queued.state);
  if (resolved.errors !== undefined) {
    return toEngineResult(state, [], toErrorTuple(resolved.errors));
  }
  return toEngineResult(resolved.state, [...queued.events, ...resolved.events]);
};

export const processEffectRuntime = (state: GameState): EngineResult => {
  const queuedFromOnPlay = queueOnPlayTriggers(state);
  if (queuedFromOnPlay !== undefined) {
    return queuedFromOnPlay;
  }
  const queuedFromMainEvent = queueMainEventTriggers(state);
  if (queuedFromMainEvent !== undefined) {
    return queuedFromMainEvent;
  }
  const queuedFromEndOfYourTurn = queueEndOfYourTurnTriggers(state);
  if (queuedFromEndOfYourTurn !== undefined) {
    return queuedFromEndOfYourTurn;
  }
  const queuedFromWhenAttacking = queueWhenAttackingTriggers(state);
  if (queuedFromWhenAttacking !== undefined) {
    return queuedFromWhenAttacking;
  }
  const queuedFromLifeRemoved = queueLifeRemovedTriggers(state);
  if (queuedFromLifeRemoved !== undefined) {
    return queuedFromLifeRemoved;
  }
  const queuedFromOpponentActivation = queueOpponentActivationTriggers(state);
  if (queuedFromOpponentActivation !== undefined) {
    return queuedFromOpponentActivation;
  }
  const resumedSequenceQuantity = resumeSequenceFrameAfterChooseQuantity(
    state,
    createSupportedTrashFromHandChoiceDecision,
  );
  if (resumedSequenceQuantity !== undefined) {
    if (!resumedSequenceQuantity.ok) {
      return toEngineResult(state, [], [resumedSequenceQuantity.error]);
    }
    return toEngineResult(
      resumedSequenceQuantity.state,
      resumedSequenceQuantity.events,
    );
  }
  if (state.deferredTriggers.length > 0) {
    if (isSupportedDamageDeferredEffectQueueState(state)) {
      return toEngineResult(state, []);
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
    );
  }
  const work = detectPendingRuntimeWork(state);
  if (work === undefined) {
    return toEngineResult(state, []);
  }
  if (work.kind === "effectQueue") {
    return processNoChoiceEffectQueue(state);
  }
  return toEngineResult(state, [], [unsupportedPendingRuntimeWorkError(work)]);
};

export const processEffectRuntimeAfterTriggerOrderChoice = (
  state: GameState,
  orderedIds: readonly QueueEntryId[],
): EngineResult => processNoChoiceEffectQueue(state, orderedIds);

export const processEffectRuntimeAfterOptionalActivationDecline = (
  state: GameState,
  orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
): EngineResult =>
  processNoChoiceEffectQueue(state, orderedCurrentChoiceGroupIds);

export const processEffectRuntimeAfterOptionalActivationAccept = (
  state: GameState,
  acceptedQueueEntryId: QueueEntryId,
  orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
): EngineResult =>
  processNoChoiceEffectQueue(state, orderedCurrentChoiceGroupIds, [
    acceptedQueueEntryId,
  ]);
