import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  EffectQueueEntry,
  SelectionId,
} from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const syntheticEntry = (
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"] = "mustRemainInSameZone",
): EffectQueueEntry => ({
  id: "sequence-support-attach-don-test-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "sequence-support-attach-don-test-window" as EffectQueueEntry["timingWindowId"],
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
    "sequence-support-attach-don-test-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy,
  causedBy: { type: "ruleProcess", name: "sequence-support-attach-don-test" },
});

test("sequence support accepts conditional DON attachment through the shared segment support shape", () => {
  const donSelection = "selected-don-for-conditional-attach" as SelectionId;
  const targetSelection = "selected-target-for-conditional-attach";
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-attach-don-test-effect" as EffectDefinition["effects"][number]["id"],
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
            type: "conditional",
            if: {
              type: "fieldCount",
              player: "self",
              filter: { categories: ["don"] },
              op: "gte",
              value: 1,
            },
            then: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  saveResultAs: donSelection,
                  effect: {
                    type: "selectTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      player: "anyPlayer",
                      zone: "costArea",
                      filter: { categories: ["don"] },
                      min: 0,
                      max: 1,
                      allowFewerIfUnavailable: true,
                      visibility: "public",
                    },
                  },
                },
                {
                  connector: "ifYouDo",
                  saveResultAs: targetSelection,
                  effect: {
                    type: "selectTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      player: "anyPlayer",
                      zones: ["leaderArea", "characterArea"],
                      filter: { categories: ["leader", "character"] },
                      min: 1,
                      max: 1,
                      allowFewerIfUnavailable: false,
                      visibility: "public",
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "attachSelectedDon",
                    selection: donSelection,
                    targetOwner: "selectedDonOwner",
                    target: {
                      type: "savedFieldObject",
                      binding: {
                        family: "selectedTargets",
                        saveResultAs: targetSelection,
                      },
                      zones: ["leaderArea", "characterArea"],
                      player: "anyPlayer",
                      filter: { categories: ["leader", "character"] },
                      visibility: "publicOnly",
                      onFailure: "failClosed",
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts attach-DON costs targeting a named field card", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-attach-don-test-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "main" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "resolveFromDestinationZone",
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "payCost",
            cost: {
              type: "attachDon",
              count: 1,
              sourcePlayer: "self",
              sourceState: "active",
              target: {
                type: "chooseFromZones",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "self",
                  zones: ["leaderArea", "characterArea"],
                  min: 1,
                  max: 1,
                  allowFewerIfUnavailable: false,
                  visibility: "public",
                  filter: { names: ["Silvers Rayleigh"] },
                },
              },
              optional: true,
            },
          },
        },
        {
          connector: "ifYouDo",
          effect: {
            type: "modifyPower",
            target: {
              type: "chooseFromZones",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "self",
                zones: ["leaderArea", "characterArea"],
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter: { categories: ["leader", "character"] },
              },
            },
            value: 1000,
            duration: { type: "thisTurn" },
          },
        },
      ],
    },
  };

  assert.equal(
    isSupportedSequenceBlock(
      syntheticEntry("resolveFromDestinationZone"),
      effectBlock,
    ),
    true,
  );
});
