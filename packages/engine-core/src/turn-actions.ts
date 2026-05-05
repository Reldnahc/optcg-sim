import type {
  Action,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import {
  createEvent,
  illegalAction,
  rebaseEvents,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { canConcede, getOpponentId, isMatchActive } from "./action-state.js";
import { assertGameStateInvariants } from "./invariants.js";
import { advanceEndPhase } from "./phases.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";

export const getTurnLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  if (
    !isMatchActive(state) ||
    state.players[playerId] === undefined ||
    state.pendingDecision !== undefined ||
    state.turn.phase !== "main" ||
    state.turn.turnPlayerId !== playerId ||
    state.battle !== undefined
  ) {
    return [];
  }
  return [{ type: "endMainPhase" }];
};

export const applyConcede = (
  state: GameState,
  action: Extract<Action, { type: "concede" }>,
): EngineResult => {
  if (!canConcede(state)) {
    return illegalAction(
      state,
      "Concede is only legal before match completion.",
    );
  }
  if (state.players[action.playerId] === undefined) {
    return illegalAction(state, "Conceding player does not exist.");
  }
  const opponentId = getOpponentId(state, action.playerId);
  if (opponentId === null) {
    return illegalAction(state, "Concede requires exactly two players.");
  }

  const events: EngineEvent[] = [
    createEvent(
      state,
      1,
      "gameEnded",
      { winner: opponentId, loser: action.playerId, reason: "concede" },
      { type: "public" },
    ),
  ];
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    status: { type: "completed", winner: opponentId },
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

export const applyEndMainPhase = (state: GameState): EngineResult => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "endMainPhase is only legal while match is active.",
    );
  }
  if (state.turn.phase !== "main") {
    return illegalAction(state, "endMainPhase requires main phase.");
  }

  const transitionEvents: EngineEvent[] = [
    createEvent(state, 1, "phaseEnded", {
      phase: "main",
      playerId: state.turn.turnPlayerId,
    }),
    createEvent(state, 2, "phaseStarted", {
      phase: "end",
      playerId: state.turn.turnPlayerId,
    }),
  ];
  const preEndState: GameState = {
    ...state,
    actionSeq: state.actionSeq + 1,
    turn: { ...state.turn, phase: "end" },
  };
  const postRuleState = applyRuleProcessingCheckpoint({
    state: preEndState,
    events: transitionEvents,
    phase: "end",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  if (postRuleState.status.type !== "active") {
    const terminalState: GameState = {
      ...postRuleState,
      seq: toStateSeq(state.seq + 1),
      eventJournal: [...state.eventJournal, ...transitionEvents],
    };
    assertGameStateInvariants(terminalState);
    return toEngineResult(terminalState, transitionEvents);
  }
  assertGameStateInvariants(preEndState);

  const endResult = advanceEndPhase(postRuleState);
  if (endResult.errors !== undefined) {
    return endResult;
  }
  const events = [
    ...transitionEvents,
    ...rebaseEvents(state, endResult.events, transitionEvents.length + 1),
  ];
  const nextState: GameState = {
    ...endResult.state,
    eventJournal: [...state.eventJournal, ...events],
  };
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};
