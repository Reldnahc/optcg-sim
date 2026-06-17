import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction, getLegalActions } from "./actions.js";
import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
} from "./turn/phases.js";
import { createActiveState, p1, p2 } from "./action-test-fixtures.js";
import {
  makeMainPhaseLegalActionState,
  toDecisionId,
} from "./action-dispatcher-test-support.js";

const recordSpanNames = (): {
  readonly names: string[];
  readonly profileSpan: <T>(name: string, fn: () => T) => T;
} => {
  const names: string[] = [];
  return {
    names,
    profileSpan(name, fn) {
      names.push(name);
      return fn();
    },
  };
};

test("getLegalActions returns main-phase actions for turn player and concession-only for non-turn player", () => {
  const state = makeMainPhaseLegalActionState();

  const forTurnPlayer = getLegalActions(state, p1);
  assert.equal(
    forTurnPlayer.some((action) => action.type === "endMainPhase"),
    true,
  );
  assert.equal(
    forTurnPlayer.some((action) => action.type === "concede"),
    true,
  );
  assert.equal(
    forTurnPlayer.filter((action) => action.type === "attachDon").length,
    2,
  );

  const forNonTurnPlayer = getLegalActions(state, p2);
  assert.deepEqual(forNonTurnPlayer, [{ type: "concede", playerId: p2 }]);
});

test("getLegalActions outside main phase still includes concession", () => {
  const state = createActiveState();
  state.turn.phase = "draw";

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
  ]);
  assert.deepEqual(getLegalActions(state, p2), [
    { type: "concede", playerId: p2 },
  ]);
});

test("getLegalActions in don phase before start-of-main acceptance exposes concession only", () => {
  const active = createActiveState();
  const refresh = advanceRefreshPhase(active);
  const draw = advanceDrawPhase(refresh.state);
  const don = advanceDonPhase(draw.state);

  assert.deepEqual(getLegalActions(don.state, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("applyAction profiles accepted dispatcher branches and preserves omitted state hashes", () => {
  const state = makeMainPhaseLegalActionState();
  const action = getLegalActions(state, p1).find(
    (candidate) => candidate.type === "attachDon",
  );
  assert.ok(action !== undefined);
  const spans = recordSpanNames();

  const result = applyAction(state, action, {
    includeStateHash: false,
    validateInvariants: false,
    profileSpan: spans.profileSpan,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
  assert.deepEqual(spans.names, [
    "engine:applyAction",
    "engine:applyAction:attachDon",
  ]);
});

test("respondToDecision profiling identifies the resolver that accepted the response", () => {
  const state = createActiveState();
  state.pendingDecision = {
    id: toDecisionId("decision:profile-choose-quantity"),
    type: "chooseQuantity",
    playerId: p1,
    prompt: "Choose quantity.",
    causedBy: { type: "ruleProcess", name: "test:chooseQuantity" },
    visibility: { type: "private", playerId: p1 },
    mode: "upTo",
    min: 0,
    max: 2,
  };
  const spans = recordSpanNames();

  const result = applyAction(
    state,
    {
      type: "respondToDecision",
      decisionId: state.pendingDecision.id,
      response: { type: "chooseQuantity", quantity: 1 },
    },
    {
      includeStateHash: false,
      validateInvariants: false,
      profileSpan: spans.profileSpan,
    },
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
  assert.ok(spans.names.includes("engine:applyAction:respondToDecision"));
  assert.ok(spans.names.includes("engine:decision:chooseQuantity"));
});
