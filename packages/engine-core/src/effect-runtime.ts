import type {
  CardSupportStatus,
  CardRef,
  EffectDefinition,
  EngineError,
  EngineResult,
  GameState,
  MatchCardManifest,
  QueueEntryId,
  ResolvedCard,
  SelectTargetsDecision,
} from "@optcg/types";

import { toEngineResult } from "./action-results.js";
import { createEffectRuntimeQueueProcessing } from "./effect-runtime-queue-processing.js";
import { createEffectRuntimeTriggerQueueing } from "./effect-runtime-trigger-queueing.js";

export type { DrawExecutionFailureReason } from "./effect-runtime-primitives.js";
export type {
  BattleKOTriggerCandidate,
  DetectBattleKOTriggerCandidatesResult,
  OnKOTriggerCandidateDetectionFailureReason,
  OnOpponentAttackTriggerQueueingFailureReason,
  OnPlayTriggerQueueingFailureReason,
  QueueBattleKOTriggersResult,
  WhenAttackingTriggerQueueingFailureReason,
} from "./effect-runtime-trigger-queueing.js";
export {
  executeNoChoiceEffectPrimitive,
  isSupportedNoChoiceOnKODrawEffect,
  isSupportedNoChoiceMainEventDrawEffect,
  isSupportedNoChoiceOnOpponentAttackDrawEffect,
  isSupportedNoChoiceOnPlayDrawEffect,
  isSupportedNoChoiceWhenAttackingDrawEffect,
} from "./effect-runtime-primitives.js";

export type PendingRuntimeWorkKind = "effectQueue" | "deferredTriggers";

export interface PendingRuntimeWork {
  kind: PendingRuntimeWorkKind;
  count: number;
}

export interface UnsupportedPendingRuntimeWorkDetails extends PendingRuntimeWork {
  reason: "unsupported-pending-runtime-work";
}

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
const queueWhenAttackingTriggers = triggerQueueing.queueWhenAttackingTriggers;
const queueOnOpponentAttackTriggers =
  triggerQueueing.queueOnOpponentAttackTriggers;
const queueEffectResolvedCustomTriggers =
  triggerQueueing.queueEffectResolvedCustomTriggers;

const queueProcessing = createEffectRuntimeQueueProcessing({
  resolveImplementedDslEffectDefinition,
  createUnsupportedPendingRuntimeWorkError: unsupportedPendingRuntimeWorkError,
  queueEffectResolvedCustomTriggers,
});

export const failUnsupportedTargetEffectContinuation =
  queueProcessing.failUnsupportedTargetEffectContinuation;
export const continueSelectedTargetEffect = (
  state: GameState,
  decision: SelectTargetsDecision,
  targets: readonly CardRef[],
) => queueProcessing.continueSelectedTargetEffect(state, decision, targets);
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
  const queuedFromWhenAttacking = queueWhenAttackingTriggers(state);
  if (queuedFromWhenAttacking !== undefined) {
    return queuedFromWhenAttacking;
  }
  if (state.deferredTriggers.length > 0) {
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
