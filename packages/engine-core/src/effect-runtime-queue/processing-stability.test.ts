import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createActiveState,
  processEffectRuntime,
  queueDrawForP1,
} from "../effect-runtime-queue-processing-test-support.js";

test("queued resolution keeps event journal and state hash stable for identical input", () => {
  const run = () => {
    const state = createActiveState();
    state.effectQueue = [queueDrawForP1()];
    return processEffectRuntime(state);
  };

  const first = run();
  const second = run();

  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.state.eventJournal, second.state.eventJournal);
  assert.equal(first.stateHash, second.stateHash);
});
