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
  SelectTargetsDecision,
  CardRef,
} from "@optcg/types";

import { createEffectRuntimeQueueResults } from "./effect-runtime-queue-results.js";
import type {
  EffectQueuePendingRuntimeWork,
  EffectRuntimeQueueTargetDecisionDependencies,
} from "./effect-runtime-queue-target-decisions.js";
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
  queueBattleKOTriggers: EffectRuntimeQueueTargetDecisionDependencies["queueBattleKOTriggers"];
}

export interface EffectRuntimeQueueProcessing {
  failUnsupportedTargetEffectContinuation: (state: GameState) => EngineResult;
  finalizeSelectedTargetEffectResolution: (
    state: GameState,
    eventBaseState: GameState,
    resolvedEntry: EffectQueueEntry,
    allEvents: EngineEvent[],
    resolutionEvents: readonly EngineEvent[],
  ) => EngineResult;
  continueSelectedTargetEffect: (
    state: GameState,
    decision: SelectTargetsDecision,
    selectedTargets: readonly CardRef[],
  ) => EngineResult;
  processNoChoiceEffectQueue: (
    state: GameState,
    orderedCurrentChoiceGroupIds?: readonly QueueEntryId[],
    acceptedOptionalQueueEntryIds?: readonly QueueEntryId[],
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
    continueSelectedTargetEffect: (state, decision, selectedTargets) => {
      const resolved = targetDecisions.continueSelectedTargetEffect(
        state,
        decision,
        selectedTargets,
      );
      if (
        resolved.errors !== undefined ||
        resolved.state.status.type !== "active"
      ) {
        return resolved;
      }
      const continued = queueResults.processNoChoiceEffectQueue(resolved.state);
      return {
        ...continued,
        events: [...resolved.events, ...continued.events],
      };
    },
    failUnsupportedTargetEffectContinuation:
      targetDecisions.failUnsupportedTargetEffectContinuation,
    finalizeSelectedTargetEffectResolution: (
      state,
      eventBaseState,
      resolvedEntry,
      allEvents,
      resolutionEvents,
    ) => {
      const resolved = targetDecisions.finalizeSelectedTargetEffectResolution(
        state,
        eventBaseState,
        resolvedEntry,
        allEvents,
        resolutionEvents,
      );
      if (
        resolved.errors !== undefined ||
        resolved.state.status.type !== "active"
      ) {
        return resolved;
      }
      const continued = queueResults.processNoChoiceEffectQueue(resolved.state);
      return {
        ...continued,
        events: [...resolved.events, ...continued.events],
      };
    },
    processNoChoiceEffectQueue: queueResults.processNoChoiceEffectQueue,
    processEffectRuntimeAfterTriggerOrderChoice:
      queueResults.processEffectRuntimeAfterTriggerOrderChoice,
  };
};
