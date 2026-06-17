import type {
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  SelectCardsDecision,
  QueueEntryId,
} from "@optcg/types";

import type { EngineResultOptions } from "../action-results.js";
import type {
  CreateUnsupportedPendingRuntimeWorkError,
  EffectRuntimeQueueTargetDecisions,
  ResolveImplementedDslEffectDefinition,
} from "./target-decisions.js";

export type QueueEffectResolvedCustomTriggers = (
  state: GameState,
  entry: EffectQueueEntry,
  events: readonly EngineEvent[],
  options?: EngineResultOptions,
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
    options?: EngineResultOptions,
  ) => EngineResult;
  processEffectRuntimeAfterTriggerOrderChoice: (
    state: GameState,
    orderedIds: readonly QueueEntryId[],
    options?: EngineResultOptions,
  ) => EngineResult;
  resumePlaySourceOverflowDecision: (
    originalState: GameState,
    decision: SelectCardsDecision,
    playCardResult: EngineResult,
    options?: EngineResultOptions,
  ) => EngineResult | undefined;
}
