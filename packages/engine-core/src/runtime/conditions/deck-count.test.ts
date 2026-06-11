import assert from "node:assert/strict";
import { test } from "vitest";

import type { Condition } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
} from "../../effect-runtime-queue/test-support.js";
import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "./evaluator.js";

test("deckCount condition evaluates self deck size with equality comparator", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  player.deck = [];
  const condition: Extract<Condition, { type: "deckCount" }> = {
    type: "deckCount",
    player: "self",
    op: "eq",
    value: 0,
  };

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), condition),
    { supported: true, passed: true },
  );

  player.deck = [must(player.hand[0], "deck card")];
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), condition),
    { supported: true, passed: false },
  );
});
