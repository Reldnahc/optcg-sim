import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const syntheticEntry = (): EffectQueueEntry => ({
  id: "sequence-support-trash-hand-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "sequence-support-trash-hand-window" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: "p1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId: "p1:source" as EffectQueueEntry["source"]["instanceId"],
    cardId: "source-card" as EffectQueueEntry["source"]["cardId"],
    playerId: "p1" as EffectQueueEntry["source"]["playerId"],
    zone: {
      zone: "characterArea",
      playerId: "p1" as EffectQueueEntry["source"]["playerId"],
      slot: "character",
      index: 0,
    },
  },
  sourceSnapshot: {
    instanceId: "p1:source" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "source-card" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
    controllerId: "p1" as EffectQueueEntry["sourceSnapshot"]["controllerId"],
    zone: {
      zone: "characterArea",
      playerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
      slot: "character",
      index: 0,
    },
    category: "character",
    colors: ["red"],
    keywords: [],
  },
  effectBlockId:
    "sequence-support-trash-hand-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: {
    type: "ruleProcess",
    name: "sequence-support-trash-hand-test",
  },
});

test("sequence support accepts trashFromHandUntilCount as a reusable hand-trash segment", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-trash-hand-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "onPlay" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: { type: "draw", player: "self", count: 1 },
        },
        {
          connector: "then",
          effect: {
            type: "trashFromHandUntilCount",
            player: "self",
            chooser: "self",
            handCount: 0,
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});
