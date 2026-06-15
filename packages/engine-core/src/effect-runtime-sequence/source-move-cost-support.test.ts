import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const activateMainEntry = (): EffectQueueEntry => ({
  id: "queue-entry:activate-main:source-move-cost-support:source:effect" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "timing-window:activate-main:source-move-cost-support" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: "p1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId:
      "p1:character:source" as EffectQueueEntry["source"]["instanceId"],
    cardId: "character-card" as EffectQueueEntry["source"]["cardId"],
    playerId: "p1" as EffectQueueEntry["source"]["playerId"],
    zone: {
      zone: "characterArea",
      playerId: "p1" as EffectQueueEntry["source"]["playerId"],
      slot: "character",
      index: 0,
    },
  },
  sourceSnapshot: {
    instanceId:
      "p1:character:source" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "character-card" as EffectQueueEntry["sourceSnapshot"]["cardId"],
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
    "sequence-support-source-hand-cost" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  queueOrigin: { type: "activateMain" },
  causedBy: { type: "ruleProcess", name: "effectRuntime:activateMain" },
});

test("sequence support accepts source character-to-hand move-card costs", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-source-hand-cost" as EffectDefinition["effects"][number]["id"],
    category: "activate",
    trigger: { type: "activateMain" },
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
              type: "moveCards",
              optional: true,
              count: 1,
              chooser: "self",
              from: {
                player: "self",
                zone: "characterArea",
                source: "effectSource",
              },
              to: { player: "self", zone: "hand" },
              order: "chooserChoice",
            },
          },
        },
        {
          connector: "ifPreviousSucceeded",
          effect: { type: "draw", player: "self", count: 1 },
        },
      ],
    },
  };

  assert.equal(
    isSupportedSequenceBlock(activateMainEntry(), effectBlock),
    true,
  );
});
