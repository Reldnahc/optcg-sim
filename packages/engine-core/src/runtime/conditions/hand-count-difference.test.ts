import assert from "node:assert/strict";
import { test } from "vitest";
import type { Condition } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  queueDrawForP1,
} from "../../effect-runtime-queue/test-support.js";
import { evaluateQueuedEffectCondition } from "./evaluator.js";

test("handCountDifference compares reusable player hand-count operands", () => {
  const state = createActiveState();
  const self = must(state.players[p1], "self player");
  const opponent = must(state.players[p2], "opponent player");
  self.hand = self.hand.slice(0, 2);
  opponent.hand = opponent.hand.slice(0, 5);

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "handCountDifference",
      minuend: { player: "opponent" },
      subtrahend: { player: "self" },
      op: "gte",
      value: 3,
    } as unknown as Condition),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "handCountDifference",
      minuend: { player: "self" },
      subtrahend: { player: "opponent" },
      op: "gte",
      value: 3,
    } as unknown as Condition),
    { supported: true, passed: false },
  );
});
