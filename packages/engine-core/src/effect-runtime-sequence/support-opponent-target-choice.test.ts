import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const syntheticEntry = (): EffectQueueEntry => ({
  id: "sequence-support-opponent-target-test-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "sequence-support-opponent-target-window" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: "p1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId: "p1:leader:source" as EffectQueueEntry["source"]["instanceId"],
    cardId: "leader-card" as EffectQueueEntry["source"]["cardId"],
    playerId: "p1" as EffectQueueEntry["source"]["playerId"],
    zone: {
      zone: "leaderArea",
      playerId: "p1" as EffectQueueEntry["source"]["playerId"],
      slot: "leader",
    },
  },
  sourceSnapshot: {
    instanceId:
      "p1:leader:source" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "leader-card" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
    controllerId: "p1" as EffectQueueEntry["sourceSnapshot"]["controllerId"],
    zone: {
      zone: "leaderArea",
      playerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
      slot: "leader",
    },
    category: "leader",
    colors: ["blue"],
    keywords: [],
  },
  effectBlockId:
    "sequence-support-opponent-target-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "sequence-support-test" },
});

test("sequence support accepts opponent-chosen field-object bounce consumers", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-opponent-target-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "counter" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select-opponent-return-target",
          connector: "always",
          saveResultAs: "selected:opponent-return-target",
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "opponent",
              player: "opponent",
              zone: "characterArea",
              min: 1,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: {
                categories: ["character"],
                state: "active",
              },
            },
          },
        },
        {
          id: "return-selected-target",
          connector: "then",
          effect: {
            type: "bounce",
            destination: "hand",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: "selected:opponent-return-target",
              },
              zone: "characterArea",
              player: "opponent",
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});
