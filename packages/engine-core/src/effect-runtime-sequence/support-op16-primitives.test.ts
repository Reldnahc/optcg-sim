import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  EffectQueueEntry,
  SelectionId,
} from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const syntheticEntry = (
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"],
): EffectQueueEntry => ({
  id: "sequence-support-op16-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "sequence-support-op16-window" as EffectQueueEntry["timingWindowId"],
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
    "sequence-support-op16-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy,
  causedBy: { type: "ruleProcess", name: "sequence-support-op16-test" },
});

test("sequence support accepts direct opponent leader rest as a reusable field mutation", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-op16-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "trigger" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "noSourceRequired",
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "rest",
            target: { type: "opponentLeader" },
          },
        },
      ],
    },
  };

  assert.equal(
    isSupportedSequenceBlock(syntheticEntry("noSourceRequired"), effectBlock),
    true,
  );
});

test("sequence support accepts optional play from hand or trash by produced selection evidence", () => {
  const handSelection = "handSelection:play-from-hand" as SelectionId;
  const trashSelection = "trashSelection:play-from-trash" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-op16-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "onKO" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "resolveFromDestinationZone",
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
            type: "choice",
            chooser: "self",
            min: 0,
            max: 1,
            options: [
              {
                id: "option:hand",
                label: "Play from hand",
                effect: {
                  type: "sequence",
                  effects: [
                    {
                      connector: "always",
                      saveResultAs: handSelection,
                      effect: {
                        type: "selectCards",
                        zone: "hand",
                        player: "self",
                        chooser: "self",
                        min: 0,
                        max: 1,
                        filter: { names: ["Fullalead"] },
                        saveAs: handSelection,
                        visibility: "chooserOnly",
                      },
                    },
                    {
                      connector: "ifPossible",
                      effect: {
                        type: "playSelected",
                        selection: handSelection,
                        ignoreCost: true,
                      },
                    },
                  ],
                },
              },
              {
                id: "option:trash",
                label: "Play from trash",
                effect: {
                  type: "sequence",
                  effects: [
                    {
                      connector: "always",
                      saveResultAs: trashSelection,
                      effect: {
                        type: "selectCards",
                        zone: "trash",
                        player: "self",
                        chooser: "self",
                        min: 0,
                        max: 1,
                        filter: { names: ["Fullalead"] },
                        saveAs: trashSelection,
                        visibility: "bothPlayers",
                      },
                    },
                    {
                      connector: "ifPossible",
                      effect: {
                        type: "playSelected",
                        selection: trashSelection,
                        ignoreCost: true,
                      },
                    },
                  ],
                },
              },
            ],
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

test("sequence support accepts selected target setBasePower without source-presence coupling", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-op16-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "onKO" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "resolveFromDestinationZone",
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
            type: "setBasePower",
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
            value: 7000,
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
