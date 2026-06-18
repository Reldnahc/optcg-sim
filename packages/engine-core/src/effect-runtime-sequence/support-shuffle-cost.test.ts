import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const syntheticEntry = (): EffectQueueEntry => ({
  id: "sequence-support-shuffle-cost-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "sequence-support-shuffle-cost-window" as EffectQueueEntry["timingWindowId"],
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
    colors: ["purple"],
    keywords: [],
  },
  effectBlockId:
    "sequence-support-shuffle-cost-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "test" },
});

test("sequence support accepts trash-to-deck moveCards and shuffleDeck cost sequence", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-shuffle-cost-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "whenAttacking" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "payCost",
            cost: {
              type: "sequence",
              optional: true,
              costs: [
                {
                  type: "moveCards",
                  count: 20,
                  chooser: "self",
                  from: { player: "self", zone: "trash" },
                  to: { player: "self", zone: "deck" },
                  order: "chooserChoice",
                },
                { type: "shuffleDeck", player: "self" },
              ],
            },
          },
        },
        {
          connector: "ifYouDo",
          effect: {
            type: "giveKeyword",
            target: { type: "self" },
            keyword: "doubleAttack",
            duration: { type: "thisBattle" },
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});
