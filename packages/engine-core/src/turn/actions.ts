import type {
  Action,
  EngineError,
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
} from "../action-results.js";
import { canConcede, getOpponentId, isMatchActive } from "../actions/state.js";
import { processEffectRuntime } from "../effect-runtime.js";
import { continueRuntimeUntilIdle } from "../effect-runtime-decision-continuation.js";
import { assertGameStateInvariants } from "../state/invariants.js";
import { advanceEndPhase } from "./phases.js";
import { applyRuleProcessingCheckpoint } from "../rules/rule-processing.js";

export interface EndMainPhaseOptions {
  readonly includeStateHash?: boolean;
  readonly validateInvariants?: boolean;
  readonly profileSpan?: <T>(name: string, fn: () => T) => T;
}

const profileEndMainSpan = <T>(
  options: EndMainPhaseOptions,
  name: string,
  fn: () => T,
): T => options.profileSpan?.(name, fn) ?? fn();

const assertEndMainInvariants = (
  options: EndMainPhaseOptions,
  name: string,
  state: GameState,
): void => {
  if (options.validateInvariants === false) {
    return;
  }
  profileEndMainSpan(options, name, () => {
    assertGameStateInvariants(state);
  });
};

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

export const applyEndMainPhase = (
  state: GameState,
  options: EndMainPhaseOptions = {},
): EngineResult => {
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
  const postRuleState = profileEndMainSpan(
    options,
    "endMainPhase:applyRules",
    () =>
      applyRuleProcessingCheckpoint({
        state: preEndState,
        events: transitionEvents,
        phase: "end",
        createEvent: (seqOffset, type, payload, visibility) =>
          createEvent(state, seqOffset, type, payload, visibility),
      }),
  );
  if (postRuleState.status.type !== "active") {
    const terminalState: GameState = {
      ...postRuleState,
      seq: toStateSeq(state.seq + 1),
      eventJournal: [...state.eventJournal, ...transitionEvents],
    };
    assertEndMainInvariants(
      options,
      "endMainPhase:terminalAssertInvariants",
      terminalState,
    );
    return toEngineResult(terminalState, transitionEvents, undefined, options);
  }
  assertEndMainInvariants(
    options,
    "endMainPhase:preEndAssertInvariants",
    preEndState,
  );

  const endPhaseState: GameState = {
    ...postRuleState,
    seq: toStateSeq(state.seq + 1),
    eventJournal: [...state.eventJournal, ...transitionEvents],
  };
  const firstRuntimeResult = profileEndMainSpan(
    options,
    "endMainPhase:processEffectRuntime",
    () => processEffectRuntime(endPhaseState),
  );
  const runtimeResult = profileEndMainSpan(
    options,
    "endMainPhase:continueRuntimeUntilIdle",
    () => continueRuntimeUntilIdle(endPhaseState, firstRuntimeResult),
  );
  if (
    runtimeResult.errors !== undefined ||
    runtimeResult.state.pendingDecision !== undefined
  ) {
    const events = [...transitionEvents, ...runtimeResult.events];
    const nextState = runtimeResult.state;
    assertEndMainInvariants(
      options,
      "endMainPhase:pendingAssertInvariants",
      nextState,
    );
    const errors = runtimeResult.errors;
    if (errors !== undefined) {
      const firstError: EngineError = errors[0] ?? {
        type: "illegalAction",
        reason: "Runtime failed without error.",
      };
      return toEngineResult(
        nextState,
        events,
        [firstError, ...errors.slice(1)],
        options,
      );
    }
    return toEngineResult(nextState, events, undefined, options);
  }
  if (runtimeResult.events.length > 0) {
    const endResult = profileEndMainSpan(
      options,
      "endMainPhase:advanceEndPhase",
      () => advanceEndPhase(runtimeResult.state, options),
    );
    if (endResult.errors !== undefined) {
      return endResult;
    }
    const events = [
      ...transitionEvents,
      ...runtimeResult.events,
      ...endResult.events,
    ];
    assertEndMainInvariants(
      options,
      "endMainPhase:runtimeAssertInvariants",
      endResult.state,
    );
    return toEngineResult(endResult.state, events, undefined, options);
  }

  const endResult = profileEndMainSpan(
    options,
    "endMainPhase:advanceEndPhase",
    () => advanceEndPhase(postRuleState, options),
  );
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
  assertEndMainInvariants(
    options,
    "endMainPhase:finalAssertInvariants",
    nextState,
  );
  return toEngineResult(nextState, events, undefined, options);
};
