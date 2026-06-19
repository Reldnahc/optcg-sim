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

test("zoneCountTotal condition evaluates a reusable total across life and hand", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const firstLifeCard = must(player.hand[0], "first life card");
  const secondLifeCard = must(player.hand[1], "second life card");
  const firstHandCard = must(player.hand[2], "first hand card");
  const secondHandCard = must(player.hand[3], "second hand card");
  const thirdHandCard = must(player.hand[4], "third hand card");
  player.hand = [firstHandCard, secondHandCard];
  player.life = [
    { card: firstLifeCard, faceUp: false },
    { card: secondLifeCard, faceUp: false },
  ];
  const condition = {
    type: "zoneCountTotal",
    counts: [
      { player: "self", zone: "life" },
      { player: "self", zone: "hand" },
    ],
    op: "lte",
    value: 4,
  } as unknown as Condition;

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), condition),
    { supported: true, passed: true },
  );

  player.hand = [...player.hand, thirdHandCard];
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), condition),
    { supported: true, passed: false },
  );
});
