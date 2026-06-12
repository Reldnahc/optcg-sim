import type {
  DecisionId,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineEventId,
  EngineResult,
  GameState,
  ResolvedCard,
  StateSeq,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./state/canonical-state.js";

export const toStateSeq = (value: number): StateSeq => value as StateSeq;

export const toDecisionId = (value: string): DecisionId => value as DecisionId;

const toEngineEventId = (value: string): EngineEventId =>
  value as EngineEventId;

export interface EngineResultOptions {
  readonly includeStateHash?: boolean;
}

export const toEngineResult = (
  state: GameState,
  events: EngineEvent[],
  errors?: readonly [EngineError, ...EngineError[]],
  options: EngineResultOptions = {},
): EngineResult => {
  const result: EngineResult = {
    state,
    events,
    stateHash:
      options.includeStateHash === false ? "" : hashCanonicalStateValue(state),
  };
  if (state.pendingDecision !== undefined) {
    result.decisions = [state.pendingDecision];
  }
  if (errors !== undefined) {
    result.errors = [...errors];
  }
  return result;
};

export const illegalAction = (state: GameState, reason: string): EngineResult =>
  toEngineResult(state, [], [{ type: "illegalAction", reason }]);

export const createEvent = (
  state: GameState,
  seqOffset: number,
  type: EngineEvent["type"],
  payload: unknown,
  visibility: EngineEvent["visibility"] = { type: "public" },
): EngineEvent => ({
  id: toEngineEventId(
    `event:${String(state.seq)}:${String(seqOffset)}:${type}`,
  ),
  seq: state.eventJournal.length + seqOffset,
  type,
  payload,
  visibility,
  causedBy: { type: "ruleProcess", name: "turnFlow" },
  createdAtStateSeq: toStateSeq(state.seq + 1),
});

export const appendEvent = (
  state: GameState,
  events: EngineEvent[],
  type: EngineEvent["type"],
  payload: unknown,
  visibility: EngineEvent["visibility"] = { type: "public" },
): void => {
  events.push(createEvent(state, events.length + 1, type, payload, visibility));
};

export const appendEffectResolvedEvent = (
  state: GameState,
  events: EngineEvent[],
  queuedEntry: EffectQueueEntry,
  effectBlock?: EffectDefinition["effects"][number],
  resolvedSourceCard?: ResolvedCard,
): void => {
  appendEvent(
    state,
    events,
    "effectResolved",
    {
      queueEntryId: queuedEntry.id,
      timingWindowId: queuedEntry.timingWindowId,
      generation: queuedEntry.generation,
      effectBlockId: queuedEntry.effectBlockId,
      ...(queuedEntry.triggerEventId === undefined
        ? {}
        : { triggerEventId: queuedEntry.triggerEventId }),
      sourcePresencePolicy: queuedEntry.sourcePresencePolicy,
      orderingGroup: queuedEntry.orderingGroup,
      ...(effectBlock === undefined
        ? {}
        : {
            controllerId: queuedEntry.controllerId,
            source: queuedEntry.source,
            sourceCardId: queuedEntry.sourceSnapshot.cardId,
            effectCategory: effectBlock.category,
            entryPoint: effectBlock.trigger,
            sourceTypes: resolvedSourceCard?.types ?? [],
            sourceCategory:
              resolvedSourceCard?.category ??
              queuedEntry.sourceSnapshot.category,
          }),
      ...(queuedEntry.presentation === undefined
        ? {}
        : { presentation: queuedEntry.presentation }),
      status: "resolved" as const,
    },
    { type: "public" },
  );
  const resolved = events[events.length - 1];
  if (resolved !== undefined) {
    resolved.causedBy = {
      type: "effect",
      queueEntryId: queuedEntry.id,
      effectId: queuedEntry.effectBlockId,
    };
  }
};

export const appendEffectQueuedEvent = (
  state: GameState,
  events: EngineEvent[],
  queuedEntry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number],
  resolvedSourceCard: ResolvedCard | undefined,
): void => {
  appendEvent(
    state,
    events,
    "effectQueued",
    {
      queueEntryId: queuedEntry.id,
      timingWindowId: queuedEntry.timingWindowId,
      generation: queuedEntry.generation,
      effectBlockId: queuedEntry.effectBlockId,
      ...(queuedEntry.triggerEventId === undefined
        ? {}
        : { triggerEventId: queuedEntry.triggerEventId }),
      sourcePresencePolicy: queuedEntry.sourcePresencePolicy,
      orderingGroup: queuedEntry.orderingGroup,
      controllerId: queuedEntry.controllerId,
      source: queuedEntry.source,
      sourceCardId: queuedEntry.sourceSnapshot.cardId,
      effectCategory: effectBlock.category,
      entryPoint: effectBlock.trigger,
      sourceTypes: resolvedSourceCard?.types ?? [],
      sourceCategory:
        resolvedSourceCard?.category ?? queuedEntry.sourceSnapshot.category,
      ...(queuedEntry.presentation === undefined
        ? {}
        : { presentation: queuedEntry.presentation }),
    },
    { type: "public" },
  );
  const queued = events[events.length - 1];
  if (queued !== undefined) {
    queued.causedBy = queuedEntry.causedBy;
  }
};

export const rebaseEvents = (
  state: GameState,
  events: EngineEvent[],
  seqOffset: number,
): EngineEvent[] =>
  events.map((event, index) => ({
    ...event,
    id: toEngineEventId(
      `event:${String(state.seq)}:${String(seqOffset + index)}:${event.type}`,
    ),
    seq: state.eventJournal.length + seqOffset + index,
    createdAtStateSeq: toStateSeq(state.seq + 1),
  }));
