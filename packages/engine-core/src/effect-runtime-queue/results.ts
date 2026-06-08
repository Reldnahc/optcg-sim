import type {
  EngineResult,
  GameState,
  SelectCardsDecision,
} from "@optcg/types";

import { resumePlaySourceOverflowDecision as resumePlaySourceOverflowDecisionHelper } from "../effect-runtime-play-source-overflow-resume.js";
import { createQueueEntryResolver } from "./entry-resolution.js";
import { createNoChoiceEffectQueueProcessor } from "./no-choice-processing.js";
import type {
  EffectRuntimeQueueResults,
  EffectRuntimeQueueResultsDependencies,
} from "./results-types.js";

export const createEffectRuntimeQueueResults = (
  dependencies: EffectRuntimeQueueResultsDependencies,
): EffectRuntimeQueueResults => {
  const queueEntryResolver = createQueueEntryResolver(dependencies);
  const noChoiceProcessor = createNoChoiceEffectQueueProcessor(
    dependencies,
    queueEntryResolver,
  );

  const resumePlaySourceOverflowDecision = (
    originalState: GameState,
    decision: SelectCardsDecision,
    playCardResult: EngineResult,
  ): EngineResult | undefined =>
    resumePlaySourceOverflowDecisionHelper({
      originalState,
      decision,
      playCardResult,
      createUnsupportedPendingRuntimeWorkError:
        dependencies.createUnsupportedPendingRuntimeWorkError,
      queueEffectResolvedCustomTriggers:
        dependencies.queueEffectResolvedCustomTriggers,
    });

  return {
    processNoChoiceEffectQueue: noChoiceProcessor.processNoChoiceEffectQueue,
    processEffectRuntimeAfterTriggerOrderChoice:
      noChoiceProcessor.processEffectRuntimeAfterTriggerOrderChoice,
    resumePlaySourceOverflowDecision,
  };
};
