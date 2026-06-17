import assert from "node:assert/strict";
import { test } from "vitest";

import { createChooseQuantityDecisionForQueuedEffect } from "./effect-runtime.js";
import {
  p1,
  queueDrawForP1,
  queueingState,
  toQueueEntryId,
} from "./effect-runtime-queue/test-support.js";

test("queued quantity decision preserves omitted state hash", () => {
  const { state } = queueingState();
  const queued = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-live-quantity"),
  };
  state.effectQueue = [queued];

  const result = createChooseQuantityDecisionForQueuedEffect(
    state,
    queued,
    {
      playerId: p1,
      prompt: "Choose quantity.",
      mode: "upTo",
      min: 0,
      max: 3,
    },
    {
      includeStateHash: false,
      validateInvariants: false,
    },
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.type, "chooseQuantity");
  assert.equal(result.stateHash, "");
});

test("queued quantity decision errors preserve omitted state hash", () => {
  const { state } = queueingState();
  const queued = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-live-quantity-error"),
  };
  state.effectQueue = [queued];

  const result = createChooseQuantityDecisionForQueuedEffect(
    state,
    queued,
    {
      playerId: p1,
      prompt: "Choose quantity.",
      mode: "upTo",
      min: -1,
      max: 3,
    },
    {
      includeStateHash: false,
      validateInvariants: false,
    },
  );

  assert.equal(result.errors?.[0]?.type, "effectRuntimeError");
  assert.equal(result.stateHash, "");
});
