import type {
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  MatchCardManifest,
  QueueEntryId,
  ResolvedCard,
} from "@optcg/types";

import { createEffectRuntimeQueueResults } from "./effect-runtime-queue-results.js";
import type { EffectQueuePendingRuntimeWork } from "./effect-runtime-queue-target-decisions.js";
import { createEffectRuntimeQueueTargetDecisions } from "./effect-runtime-queue-target-decisions.js";

type ResolveImplementedDslEffectDefinition = (
  card: ResolvedCard,
  manifest: MatchCardManifest,
) =>
  | { ok: true; definition: EffectDefinition }
  | { ok: false; error: EngineError };

type QueueEffectResolvedCustomTriggers = (
  state: GameState,
  entry: EffectQueueEntry,
  events: readonly EngineEvent[],
) => EngineResult | undefined;

export interface EffectRuntimeQueueProcessingDependencies {
  resolveImplementedDslEffectDefinition: ResolveImplementedDslEffectDefinition;
  createUnsupportedPendingRuntimeWorkError: (
    work: EffectQueuePendingRuntimeWork,
  ) => EngineError;
  queueEffectResolvedCustomTriggers: QueueEffectResolvedCustomTriggers;
}

export interface EffectRuntimeQueueProcessing {
  failUnsupportedTargetEffectContinuation: (state: GameState) => EngineResult;
  processNoChoiceEffectQueue: (
    state: GameState,
    orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
  ) => EngineResult;
  processEffectRuntimeAfterTriggerOrderChoice: (
    state: GameState,
    orderedIds: readonly QueueEntryId[],
  ) => EngineResult;
}

export const createEffectRuntimeQueueProcessing = (
  dependencies: EffectRuntimeQueueProcessingDependencies,
): EffectRuntimeQueueProcessing => {
  const targetDecisions = createEffectRuntimeQueueTargetDecisions(dependencies);
  const queueResults = createEffectRuntimeQueueResults({
    ...dependencies,
    targetDecisions,
  });

  return {
    failUnsupportedTargetEffectContinuation:
      targetDecisions.failUnsupportedTargetEffectContinuation,
    processNoChoiceEffectQueue: queueResults.processNoChoiceEffectQueue,
    processEffectRuntimeAfterTriggerOrderChoice:
      queueResults.processEffectRuntimeAfterTriggerOrderChoice,
  };
};
