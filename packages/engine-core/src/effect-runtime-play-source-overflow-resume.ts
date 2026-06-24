import type {
  EngineEvent,
  EngineResult,
  GameState,
  SelectCardsDecision,
} from "@optcg/types";

import {
  appendEffectResolvedEvent,
  type EngineResultOptions,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { cleanupResolvedLifeTrigger } from "./effect-runtime-life-trigger-cleanup.js";
import { createUnsupportedEffectQueueWork } from "./effect-runtime-queue/diagnostics.js";
import type { CreateUnsupportedPendingRuntimeWorkError } from "./effect-runtime-queue/target-decisions.js";
import type { QueueEffectResolvedCustomTriggers } from "./effect-runtime-queue/results-types.js";

export const resumePlaySourceOverflowDecision = (params: {
  originalState: GameState;
  decision: SelectCardsDecision;
  playCardResult: EngineResult;
  createUnsupportedPendingRuntimeWorkError: CreateUnsupportedPendingRuntimeWorkError;
  queueEffectResolvedCustomTriggers: QueueEffectResolvedCustomTriggers;
  options?: EngineResultOptions;
}): EngineResult | undefined => {
  const {
    originalState,
    decision,
    playCardResult,
    createUnsupportedPendingRuntimeWorkError,
    queueEffectResolvedCustomTriggers,
    options = {},
  } = params;
  const runtime = decision.runtime?.playSourceOverflow;
  if (runtime === undefined) {
    return undefined;
  }
  if (
    playCardResult.errors !== undefined ||
    playCardResult.state.pendingDecision !== undefined
  ) {
    return playCardResult;
  }
  const selected = originalState.effectQueue.find(
    (entry) => entry.id === runtime.queueEntryId,
  );
  if (selected === undefined) {
    return toEngineResult(
      originalState,
      [],
      [
        createUnsupportedPendingRuntimeWorkError(
          createUnsupportedEffectQueueWork(originalState.effectQueue.length, {
            gate: "queue-entry-resolution",
            queueReason: "play-source-overflow-entry-missing",
          }),
        ),
      ],
      options,
    );
  }

  let nextState: GameState = {
    ...playCardResult.state,
    effectQueue: playCardResult.state.effectQueue.filter(
      (entry) => entry.id !== selected.id,
    ),
  };
  const resolvedEvents: EngineEvent[] = [];
  const resolvedEventBaseState: GameState = {
    ...nextState,
    seq: toStateSeq(nextState.seq - 1),
  };
  const resolvedEvent = appendEffectResolvedEvent(
    resolvedEventBaseState,
    resolvedEvents,
    selected,
  );
  nextState = {
    ...nextState,
    eventJournal: [...nextState.eventJournal, ...resolvedEvents],
  };
  const cleanup = cleanupResolvedLifeTrigger(nextState, selected);
  nextState = cleanup.state;
  const allEvents = [
    ...playCardResult.events,
    ...resolvedEvents,
    ...cleanup.events,
  ];

  const triggered = queueEffectResolvedCustomTriggers(
    nextState,
    selected,
    [...playCardResult.events, resolvedEvent, ...cleanup.events],
    options,
  );
  if (triggered !== undefined) {
    if (triggered.errors !== undefined) {
      return triggered;
    }
    nextState = triggered.state;
    allEvents.push(...triggered.events);
  }
  return toEngineResult(nextState, allEvents, undefined, options);
};
