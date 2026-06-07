import type {
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
} from "@optcg/types";

import { appendEffectResolvedEvent, toStateSeq } from "../action-results.js";
import { resolveImplementedDslEffectDefinition } from "../effect-runtime-definition-lookup.js";
import { findMatchingKOMoveEvent } from "../effect-runtime-trigger-source-lookup.js";
import { createEffectRuntimeTriggerQueueing } from "../runtime/trigger-queueing/core.js";

type AppendCompletedSequenceResult =
  | { ok: true; state: GameState }
  | { error: EngineError; ok: false };

const unsupportedPendingRuntimeWorkError = (work: {
  count: number;
  kind: "deferredTriggers" | "effectQueue";
}): EngineError => ({
  type: "effectRuntimeError",
  effectId:
    work.kind === "effectQueue"
      ? "unsupported-effect-queue"
      : "unsupported-deferred-triggers",
  details: {
    count: work.count,
    kind: work.kind,
    reason: "unsupported-pending-runtime-work",
  },
});

const triggerQueueing = createEffectRuntimeTriggerQueueing({
  resolveImplementedDslEffectDefinition,
  createUnsupportedPendingRuntimeWorkError: unsupportedPendingRuntimeWorkError,
});

export const appendEffectResolvedForCompletedSequence = (
  state: GameState,
  entry: EffectQueueEntry,
  events: EngineEvent[],
): AppendCompletedSequenceResult => {
  const resolvedEvents: EngineEvent[] = [];
  const resolvedEventBaseState: GameState = {
    ...state,
    seq: toStateSeq(state.seq - 1),
  };
  appendEffectResolvedEvent(resolvedEventBaseState, resolvedEvents, entry);
  const resolvedEvent = resolvedEvents[0];
  if (resolvedEvent === undefined) {
    return { ok: true, state };
  }
  events.push(resolvedEvent);
  let nextState: GameState = {
    ...state,
    effectQueue: state.effectQueue.filter(
      (candidate) => candidate.id !== entry.id,
    ),
    eventJournal: [...state.eventJournal, resolvedEvent],
  };

  const queueableKOEvents = events.filter(
    (event) =>
      event.type !== "cardKOd" ||
      findMatchingKOMoveEvent(event, events) !== undefined,
  );
  if (!queueableKOEvents.some((event) => event.type === "cardKOd")) {
    return { ok: true, state: nextState };
  }
  const beforeQueueEventCount = queueableKOEvents.length;
  const queued = triggerQueueing.queueBattleKOTriggers(
    nextState,
    resolvedEventBaseState,
    queueableKOEvents,
  );
  if (!queued.ok) {
    return queued;
  }
  const queuedEvents = queueableKOEvents.slice(beforeQueueEventCount);
  events.push(...queuedEvents);
  nextState =
    queuedEvents.length === 0
      ? queued.state
      : {
          ...queued.state,
          eventJournal: [...nextState.eventJournal, ...queuedEvents],
        };

  return { ok: true, state: nextState };
};
