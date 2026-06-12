import assert from "node:assert/strict";
import { test } from "vitest";

import type { Condition, EffectQueueEntry } from "@optcg/types";

import {
  createActiveState,
  p1,
  queueDrawForP1,
  toCardId,
  toInstanceId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";
import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "./evaluator.js";

test("cardState condition compares the queued source field state", () => {
  const state = createActiveState();
  const source = withCardInZone({
    state,
    playerId: p1,
    card: {
      cardId: toCardId("source-character"),
      instanceId: toInstanceId("source-instance"),
      owner: p1,
      controller: p1,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      state: "rested",
      attachedDon: [],
      turnPlayed: state.turn.globalTurn,
    },
    zone: "characterArea",
  });
  source.state = "rested";
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: source.zone,
      category: "character",
      colors: ["red"],
      cost: 3,
      keywords: [],
    },
  };
  const condition: Extract<Condition, { type: "cardState" }> = {
    type: "cardState",
    target: { type: "self" },
    state: "rested",
  };

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(evaluateQueuedEffectCondition(state, entry, condition), {
    supported: true,
    passed: true,
  });

  source.state = "active";
  assert.deepEqual(evaluateQueuedEffectCondition(state, entry, condition), {
    supported: true,
    passed: false,
  });
});
