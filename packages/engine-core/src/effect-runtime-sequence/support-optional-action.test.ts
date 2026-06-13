import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  EffectQueueEntry,
  HandSelectionId,
} from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const syntheticEntry = (): EffectQueueEntry => ({
  id: "sequence-support-optional-action-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "sequence-support-optional-action-window" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: "p1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId:
      "p1:leader:optional-action-source" as EffectQueueEntry["source"]["instanceId"],
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
      "p1:leader:optional-action-source" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
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
    "sequence-support-optional-action-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "sequence-support-optional-action" },
});

test("sequence support accepts optional nested action sequences with dependent body", () => {
  const returnSelection = "selected:return-to-owner-hand";
  const handSelection = "handSelection:play-from-hand" as HandSelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-optional-action-effect" as EffectDefinition["effects"][number]["id"],
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
          optional: true,
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                saveResultAs: returnSelection,
                effect: {
                  type: "selectTargets",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "opponent",
                    zone: "characterArea",
                    min: 0,
                    max: 1,
                    allowFewerIfUnavailable: true,
                    visibility: "public",
                    filter: { categories: ["character"], cost: { max: 5 } },
                  },
                },
              },
              {
                connector: "then",
                effect: {
                  type: "bounce",
                  destination: "hand",
                  target: {
                    type: "savedFieldObject",
                    binding: {
                      family: "selectedTargets",
                      saveResultAs: returnSelection,
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
        },
        {
          connector: "ifYouDo",
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                saveResultAs: handSelection,
                effect: {
                  type: "selectCards",
                  zone: "hand",
                  player: "opponent",
                  chooser: "opponent",
                  min: 0,
                  max: 1,
                  filter: { categories: ["character"], cost: { max: 4 } },
                  saveAs: handSelection,
                  visibility: "chooserOnly",
                },
              },
              {
                connector: "ifPossible",
                effect: {
                  type: "playSelected",
                  selection: handSelection,
                  player: "opponent",
                  ignoreCost: true,
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
