import type {
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  SelectCardsDecision,
  QueueEntryId,
} from "@optcg/types";

import type {
  CreateUnsupportedPendingRuntimeWorkError,
  EffectRuntimeQueueTargetDecisions,
  ResolveImplementedDslEffectDefinition,
} from "./target-decisions.js";

export type QueueEffectResolvedCustomTriggers = (
  state: GameState,
  entry: EffectQueueEntry,
  events: readonly EngineEvent[],
) => EngineResult | undefined;

export interface EffectRuntimeQueueResultsDependencies {
  resolveImplementedDslEffectDefinition: ResolveImplementedDslEffectDefinition;
  createUnsupportedPendingRuntimeWorkError: CreateUnsupportedPendingRuntimeWorkError;
  queueEffectResolvedCustomTriggers: QueueEffectResolvedCustomTriggers;
  targetDecisions: EffectRuntimeQueueTargetDecisions;
}

export type QueuedEffectDefinitionResolverDependencies = Pick<
  EffectRuntimeQueueResultsDependencies,
  "resolveImplementedDslEffectDefinition"
>;

export interface EffectRuntimeQueueResults {
  processNoChoiceEffectQueue: (
    state: GameState,
    orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
    acceptedOptionalQueueEntryIds?: readonly QueueEntryId[],
  ) => EngineResult;
  processEffectRuntimeAfterTriggerOrderChoice: (
    state: GameState,
    orderedIds: readonly QueueEntryId[],
  ) => EngineResult;
  resumePlaySourceOverflowDecision: (
    originalState: GameState,
    decision: SelectCardsDecision,
    playCardResult: EngineResult,
  ) => EngineResult | undefined;
}
