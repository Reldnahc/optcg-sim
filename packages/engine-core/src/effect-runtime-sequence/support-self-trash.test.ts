import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const syntheticEntry = (): EffectQueueEntry => ({
  id: "sequence-support-self-trash-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "sequence-support-self-trash-window" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: "p1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId: "p1:stage:source" as EffectQueueEntry["source"]["instanceId"],
    cardId: "stage-card" as EffectQueueEntry["source"]["cardId"],
    playerId: "p1" as EffectQueueEntry["source"]["playerId"],
    zone: {
      zone: "stageArea",
      playerId: "p1" as EffectQueueEntry["source"]["playerId"],
      slot: "stage",
    },
  },
  sourceSnapshot: {
    instanceId:
      "p1:stage:source" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "stage-card" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
    controllerId: "p1" as EffectQueueEntry["sourceSnapshot"]["controllerId"],
    zone: {
      zone: "stageArea",
      playerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
      slot: "stage",
    },
    category: "stage",
    colors: ["red"],
    keywords: [],
  },
  effectBlockId:
    "sequence-support-self-trash-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "sequence-support-self-trash" },
});

test("sequence support accepts self-target trash consumers", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-self-trash-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "endOfYourTurn" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "trash",
            target: { type: "self" },
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});
