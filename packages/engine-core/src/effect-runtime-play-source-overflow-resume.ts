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
        createUnsupportedPendingRuntimeWorkError({
          kind: "effectQueue",
          count: originalState.effectQueue.length,
        }),
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
  appendEffectResolvedEvent(resolvedEventBaseState, resolvedEvents, selected);
  const resolvedEvent = resolvedEvents[0];
  if (resolvedEvent !== undefined) {
    nextState = {
      ...nextState,
      eventJournal: [...nextState.eventJournal, resolvedEvent],
    };
  }
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
    allEvents,
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
