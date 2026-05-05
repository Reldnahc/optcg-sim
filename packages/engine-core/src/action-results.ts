import type {
  DecisionId,
  EngineError,
  EngineEvent,
  EngineEventId,
  EngineResult,
  GameState,
  StateSeq,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";

export const toStateSeq = (value: number): StateSeq => value as StateSeq;

export const toDecisionId = (value: string): DecisionId => value as DecisionId;

const toEngineEventId = (value: string): EngineEventId =>
  value as EngineEventId;

export const toEngineResult = (
  state: GameState,
  events: EngineEvent[],
  errors?: readonly [EngineError, ...EngineError[]],
): EngineResult => {
  const result: EngineResult = {
    state,
    events,
    stateHash: hashCanonicalStateValue(state),
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
