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
  SelectCardsDecision,
  CardRef,
} from "@optcg/types";

import type { EngineResultOptions } from "../action-results.js";
import { createEffectRuntimeQueueResults } from "./results.js";
import type {
  EffectQueuePendingRuntimeWork,
  EffectRuntimeQueueTargetDecisionDependencies,
} from "./target-decisions.js";
import { createEffectRuntimeQueueTargetDecisions } from "./target-decisions.js";

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
    options?: EngineResultOptions,
  ) => EngineResult;
  continueSelectedTargetEffect: (
    state: GameState,
    decision: SelectTargetsDecision,
    selectedTargets: readonly CardRef[],
    options?: EngineResultOptions,
  ) => EngineResult;
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
  ) => EngineResult | undefined;
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
    continueSelectedTargetEffect: (
      state,
      decision,
      selectedTargets,
      options = {},
    ) => {
      const resolved = targetDecisions.continueSelectedTargetEffect(
        state,
        decision,
        selectedTargets,
        options,
      );
      if (
        resolved.errors !== undefined ||
        resolved.state.status.type !== "active"
      ) {
        return resolved;
      }
      if (resolved.state.pendingDecision !== undefined) {
        return resolved;
      }
      const continued = queueResults.processNoChoiceEffectQueue(
        resolved.state,
        undefined,
        [],
        options,
      );
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
      options = {},
    ) => {
      const resolved = targetDecisions.finalizeSelectedTargetEffectResolution(
        state,
        eventBaseState,
        resolvedEntry,
        allEvents,
        resolutionEvents,
        options,
      );
      if (
        resolved.errors !== undefined ||
        resolved.state.status.type !== "active"
      ) {
        return resolved;
      }
      const continued = queueResults.processNoChoiceEffectQueue(
        resolved.state,
        undefined,
        [],
        options,
      );
      return {
        ...continued,
        events: [...resolved.events, ...continued.events],
      };
    },
    processNoChoiceEffectQueue: queueResults.processNoChoiceEffectQueue,
    processEffectRuntimeAfterTriggerOrderChoice:
      queueResults.processEffectRuntimeAfterTriggerOrderChoice,
    resumePlaySourceOverflowDecision:
      queueResults.resumePlaySourceOverflowDecision,
  };
};
