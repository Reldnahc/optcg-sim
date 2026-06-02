import assert from "node:assert/strict";
import { test } from "vitest";

import type { Action, EngineResult, GameState } from "@optcg/types";

import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { createInitialState } from "../initial-state.js";
import { startMulliganFlow } from "../mulligan.js";
import { applyConcede, applyEndMainPhase } from "./actions.js";
import {
  createActiveState,
  createInput,
  must,
  p1,
  p2,
} from "../action-test-fixtures.js";
import { setupAttackState } from "../battle/test-fixtures.js";

const applyTurnTestAction = (
  state: GameState,
  action:
    | Extract<Action, { type: "concede" }>
    | Extract<Action, { type: "endMainPhase" }>,
): EngineResult => {
  if (action.type === "concede") {
    return applyConcede(state, action);
  }
  return applyEndMainPhase(state);
};

test("applyAction endMainPhase transitions to next turn refresh", () => {
  const state = createActiveState();
  state.turn.phase = "main";
  const seqBefore = state.seq;
  const actionSeqBefore = state.actionSeq;
  const journalLengthBefore = state.eventJournal.length;

  const result = applyTurnTestAction(state, { type: "endMainPhase" });
  assert.equal(result.errors, undefined);
  assert.equal(result.state.turn.phase, "refresh");
  assert.equal(result.state.turn.turnPlayerId, p2);
  assert.equal(
    result.state.seq,
    ((seqBefore as number) + 1) as typeof state.seq,
  );
  assert.equal(result.state.actionSeq, actionSeqBefore + 1);
  assert.equal(
    result.state.eventJournal.length,
    journalLengthBefore + result.events.length,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
  assert.equal(
    result.events.every(
      (event) => event.createdAtStateSeq === result.state.seq,
    ),
    true,
  );
});

test("applyAction concede immediately completes match for opponent", () => {
  const state = createActiveState();
  state.turn.phase = "draw";

  const result = applyTurnTestAction(state, { type: "concede", playerId: p1 });
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.status, { type: "completed", winner: p2 });
});

test("applyAction concession during a pending decision clears the decision", () => {
  const setup = createInitialState(createInput());
  const state = startMulliganFlow(setup).state;
  const result = applyTurnTestAction(state, { type: "concede", playerId: p1 });

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.status, { type: "completed", winner: p2 });
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.decisions, undefined);
});

test("simultaneous defeat conditions resolve as draw", () => {
  const state = createActiveState();
  state.status = { type: "active" };
  state.turn.phase = "main";
  must(state.players[p1], "p1").deck = [];
  must(state.players[p2], "p2").deck = [];

  const result = applyTurnTestAction(state, { type: "endMainPhase" });
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.status, { type: "completed", winner: "draw" });
});

test("rejected illegal actions do not run terminal rule processing", () => {
  const state = createActiveState();
  state.turn.phase = "draw";
  must(state.players[p1], "p1").deck = [];
  const before = JSON.stringify(state);

  const result = applyTurnTestAction(state, { type: "endMainPhase" });
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(
    result.events.some((event) => event.type === "gameEnded"),
    false,
  );
});

test("terminal rule-processing events and state hash are deterministic", () => {
  const createDeckOutState = () => {
    const state = setupAttackState();
    must(state.players[p2], "p2").deck = [];
    return state;
  };

  const first = applyTurnTestAction(createDeckOutState(), {
    type: "endMainPhase",
  });
  const second = applyTurnTestAction(createDeckOutState(), {
    type: "endMainPhase",
  });

  assert.equal(first.errors, undefined);
  assert.equal(second.errors, undefined);
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(
    first.state.eventJournal.slice(-first.events.length),
    first.events,
  );
  assert.deepEqual(
    first.events.map((event) => event.seq),
    [...new Set(first.events.map((event) => event.seq))],
  );
  assert.deepEqual(
    first.events.map((event) => event.id),
    [...new Set(first.events.map((event) => event.id))],
  );
  assert.equal(first.stateHash, second.stateHash);
});
