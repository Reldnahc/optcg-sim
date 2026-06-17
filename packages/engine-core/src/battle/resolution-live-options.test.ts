import assert from "node:assert/strict";
import { test } from "vitest";

import { must, p1, p2 } from "../action-test-fixtures.js";
import { resolveSupportedVanillaBattle } from "./actions.js";
import { setupAttackState } from "./test-fixtures.js";

const liveOptions = {
  includeStateHash: false,
  validateInvariants: false,
} as const;

test("battle resolution preserves omitted state hash", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.battle = {
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    step: "attack",
    damageCount: 1,
  };
  const result = resolveSupportedVanillaBattle(state, liveOptions);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.type, "selectCards");
  assert.equal(result.stateHash, "");
});
