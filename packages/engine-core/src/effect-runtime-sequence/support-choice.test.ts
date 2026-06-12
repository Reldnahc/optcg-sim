import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  EffectQueueEntry,
  SelectionId,
} from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const syntheticEntry = (): EffectQueueEntry => ({
  id: "sequence-support-choice-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "sequence-support-choice-window" as EffectQueueEntry["timingWindowId"],
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
    colors: ["red"],
    keywords: [],
  },
  effectBlockId:
    "sequence-support-choice-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "sequence-support-choice-test" },
});

test("sequence support accepts body choice options that consume a produced selected card", () => {
  const selection = "trashSelection:play-or-life" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-choice-effect" as EffectDefinition["effects"][number]["id"],
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
          saveResultAs: selection,
          effect: {
            type: "selectCards",
            zone: "trash",
            player: "self",
            chooser: "self",
            min: 0,
            max: 1,
            filter: {
              categories: ["character"],
              typesAny: ["Thriller Bark Pirates"],
              cost: { max: 4 },
            },
            saveAs: selection,
            visibility: "bothPlayers",
          },
        },
        {
          connector: "ifPossible",
          effect: {
            type: "choice",
            chooser: "self",
            min: 1,
            max: 1,
            options: [
              {
                id: "selected:play",
                effect: {
                  type: "playSelected",
                  selection,
                  ignoreCost: true,
                },
              },
              {
                id: "selected:life",
                effect: {
                  type: "moveSelected",
                  selection,
                  from: "trash",
                  to: "life",
                  position: "top",
                  destinationFaceUp: true,
                },
              },
            ],
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support rejects body choice selected-card consumers without producer evidence", () => {
  const selection = "trashSelection:unproduced-choice" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-choice-effect" as EffectDefinition["effects"][number]["id"],
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
          effect: {
            type: "choice",
            chooser: "self",
            min: 1,
            max: 1,
            options: [
              {
                id: "selected:play",
                effect: {
                  type: "playSelected",
                  selection,
                  ignoreCost: true,
                },
              },
              {
                id: "selected:life",
                effect: {
                  type: "moveSelected",
                  selection,
                  from: "trash",
                  to: "life",
                  position: "top",
                  destinationFaceUp: true,
                },
              },
            ],
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), false);
});
