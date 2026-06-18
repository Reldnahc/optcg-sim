import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";
import { sequenceQueueState } from "./search-reveal-test-support.js";
import { processEffectRuntime } from "../effect-runtime.js";
import { p1 } from "../effect-runtime-queue/test-support.js";

const syntheticEntry = (): EffectQueueEntry => ({
  id: "sequence-support-extra-turn-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "sequence-support-extra-turn-window" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: p1,
  source: {
    instanceId:
      "p1:leader:extra-turn-source" as EffectQueueEntry["source"]["instanceId"],
    cardId: "leader-card" as EffectQueueEntry["source"]["cardId"],
    playerId: p1,
    zone: {
      zone: "leaderArea",
      playerId: p1,
      slot: "leader",
    },
  },
  sourceSnapshot: {
    instanceId:
      "p1:leader:extra-turn-source" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "leader-card" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: p1,
    controllerId: p1,
    zone: {
      zone: "leaderArea",
      playerId: p1,
      slot: "leader",
    },
    category: "leader",
    colors: ["blue"],
    keywords: [],
  },
  effectBlockId:
    "sequence-support-extra-turn-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "sequence-support-extra-turn" },
});

test("sequence support accepts reusable take-extra-turn primitive", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-extra-turn-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "onPlay" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: { type: "takeExtraTurn", player: "self" },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence runtime appends the resolved player to the extra-turn queue", () => {
  const { state } = sequenceQueueState(
    { type: "takeExtraTurn", player: "self" },
    0,
  );

  const resolved = processEffectRuntime(state);

  assert.equal(resolved.errors, undefined);
  assert.deepEqual(resolved.state.turn.extraTurnPlayerIds, [p1]);
});
