import assert from "node:assert/strict";
import { test } from "vitest";

import { hashCanonicalStateValue } from "./state/canonical-state.js";
import { createActiveState } from "./action-test-fixtures.js";
import { processEffectRuntime } from "./effect-runtime.js";

test("empty effect runtime processing is a deterministic no-op", () => {
  const state = createActiveState();
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = processEffectRuntime(state);

  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
  assert.equal(result.errors, undefined);
  assert.equal(result.decisions, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.seq, before.seq);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
});
