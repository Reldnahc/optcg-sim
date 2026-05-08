import assert from "node:assert/strict";
import { test } from "vitest";

import { getLegalActions } from "./actions.js";
import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
} from "./phases.js";
import { createActiveState, p1, p2 } from "./action-test-fixtures.js";
import { makeMainPhaseLegalActionState } from "./action-dispatcher-test-support.js";

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
