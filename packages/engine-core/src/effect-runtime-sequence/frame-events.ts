import type { EffectQueueEntry, EngineEvent, GameState } from "@optcg/types";

import { appendEvent, toStateSeq } from "../action-results.js";

export const appendEffectResolvedForCompletedSequence = (
  state: GameState,
  entry: EffectQueueEntry,
  events: EngineEvent[],
): GameState => {
  const resolvedEvents: EngineEvent[] = [];
  const resolvedEventBaseState: GameState = {
    ...state,
    seq: toStateSeq(state.seq - 1),
  };
  appendEvent(
    resolvedEventBaseState,
    resolvedEvents,
    "effectResolved",
    {
      queueEntryId: entry.id,
      timingWindowId: entry.timingWindowId,
      generation: entry.generation,
      effectBlockId: entry.effectBlockId,
      ...(entry.triggerEventId === undefined
        ? {}
        : { triggerEventId: entry.triggerEventId }),
      sourcePresencePolicy: entry.sourcePresencePolicy,
      orderingGroup: entry.orderingGroup,
      status: "resolved" as const,
    },
    { type: "public" },
  );
  const resolvedEvent = resolvedEvents[0];
  if (resolvedEvent === undefined) {
    return state;
  }
  resolvedEvent.causedBy = {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  };
  events.push(resolvedEvent);
  return {
    ...state,
    effectQueue: state.effectQueue.filter(
      (candidate) => candidate.id !== entry.id,
    ),
    eventJournal: [...state.eventJournal, resolvedEvent],
  };
};
