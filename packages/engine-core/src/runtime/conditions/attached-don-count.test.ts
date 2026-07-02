import assert from "node:assert/strict";
import { test } from "vitest";
import type { CardInstance, PlayerId } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
} from "../../effect-runtime-queue/test-support.js";
import { evaluateQueuedEffectCondition } from "./evaluator.js";

const removeFirstDonFromDeck = (
  state: ReturnType<typeof createActiveState>,
  playerId: PlayerId,
): CardInstance => {
  const player = must(state.players[playerId], "player");
  const next = must(player.donDeck.shift(), "don deck card");
  return { ...next, owner: playerId, controller: playerId };
};

test("attachedDonCount condition supports the controller leader target", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const attachedDon = removeFirstDonFromDeck(state, p1);
  player.costArea = [
    {
      ...attachedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
    },
  ];
  player.leader = {
    ...player.leader,
    attachedDon: [attachedDon.instanceId],
  };

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "attachedDonCount",
      target: { type: "myLeader" },
      op: "gte",
      value: 1,
    }),
    { supported: true, passed: true },
  );
});
