import assert from "node:assert/strict";
import { test } from "vitest";

import type { Condition } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  queueDrawForP1,
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";
import { evaluateQueuedEffectCondition } from "./effect-runtime-conditions.js";

const opponentRestedCharacterCount = (
  value: number,
  op: Extract<Condition, { type: "fieldCount" }>["op"] = "gte",
): Extract<Condition, { type: "fieldCount" }> => ({
  type: "fieldCount",
  player: "opponent",
  filter: { categories: ["character"], state: "rested" },
  op,
  value,
});

test("fieldCount condition supports opponent rested character thresholds", () => {
  const state = createActiveState();
  const opponent = must(state.players[p2], "p2");
  const first = withCardInZone({
    state,
    playerId: p2,
    card: must(opponent.hand[0], "first character"),
    zone: "characterArea",
  });
  const second = withCardInZone({
    state,
    playerId: p2,
    card: must(opponent.hand[1], "second character"),
    zone: "characterArea",
  });
  first.state = "rested";
  second.state = "rested";

  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      opponentRestedCharacterCount(2),
    ),
    { supported: true, passed: true },
  );
  second.state = "active";
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      opponentRestedCharacterCount(2),
    ),
    { supported: true, passed: false },
  );
});
