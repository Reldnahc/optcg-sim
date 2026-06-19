import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  EffectQueueEntry,
  HandSelectionId,
  SelectionId,
} from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const activateMainEntry = (): EffectQueueEntry => ({
  id: "queue-entry:activate-main:conditional-saved-reference" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "timing-window:activate-main:conditional-saved-reference" as EffectQueueEntry["timingWindowId"],
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
    "sequence-support-conditional-saved-target-sibling" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  queueOrigin: { type: "activateMain" },
  causedBy: { type: "ruleProcess", name: "effectRuntime:activateMain" },
});

test("sequence support carries parent saved targets into conditional sibling segments", () => {
  const targetSelection = "selected:return-to-owner-hand" as SelectionId;
  const handSelection = "handSelection:play-from-hand" as HandSelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-conditional-saved-target-sibling" as EffectDefinition["effects"][number]["id"],
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
          saveResultAs: targetSelection,
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zone: "characterArea",
              min: 1,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: { categories: ["character"] },
            },
          },
        },
        {
          connector: "then",
          effect: {
            type: "conditional",
            if: {
              type: "fieldCount",
              player: "self",
              filter: { categories: ["character"] },
              op: "eq",
              value: 5,
            },
            then: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "bounce",
                    destination: "hand",
                    target: {
                      type: "savedFieldObject",
                      binding: {
                        family: "selectedTargets",
                        saveResultAs: targetSelection,
                      },
                      zone: "characterArea",
                      player: "self",
                      visibility: "publicOnly",
                      onFailure: "failClosed",
                    },
                  },
                },
              ],
            },
          },
        },
        {
          connector: "then",
          saveResultAs: handSelection,
          effect: {
            type: "selectCards",
            zone: "hand",
            player: "self",
            chooser: "self",
            min: 0,
            max: 1,
            filter: {
              categories: ["character"],
              cost: { max: 5 },
              colorRelation: {
                type: "differentFromSavedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: targetSelection,
                },
              },
            },
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
  };

  assert.equal(
    isSupportedSequenceBlock(activateMainEntry(), effectBlock),
    true,
  );
});

test("sequence support accepts optional cost before conditional branch-local saved target play", () => {
  const targetSelection = "selected:returned-character" as SelectionId;
  const handSelection = "handSelection:different-color-play" as HandSelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-costed-conditional-return-play" as EffectDefinition["effects"][number]["id"],
    category: "activate",
    trigger: { type: "activateMain" },
    optional: false,
    oncePerTurn: true,
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "payCost",
            cost: { type: "restDon", count: 2, optional: true },
          },
        },
        {
          connector: "ifYouDo",
          effect: {
            type: "conditional",
            if: {
              type: "fieldCount",
              player: "self",
              filter: { categories: ["character"] },
              op: "eq",
              value: 5,
            },
            then: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  saveResultAs: targetSelection,
                  effect: {
                    type: "selectTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      player: "self",
                      zone: "characterArea",
                      min: 1,
                      max: 1,
                      allowFewerIfUnavailable: false,
                      visibility: "public",
                      filter: { categories: ["character"] },
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
                        saveResultAs: targetSelection,
                      },
                      zone: "characterArea",
                      player: "self",
                      visibility: "publicOnly",
                      onFailure: "failClosed",
                    },
                  },
                },
                {
                  connector: "then",
                  saveResultAs: handSelection,
                  effect: {
                    type: "selectCards",
                    zone: "hand",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: {
                      categories: ["character"],
                      cost: { max: 5 },
                      colorRelation: {
                        type: "differentFromSavedFieldObject",
                        binding: {
                          family: "selectedTargets",
                          saveResultAs: targetSelection,
                        },
                      },
                    },
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
        },
      ],
    },
  };

  assert.equal(
    isSupportedSequenceBlock(activateMainEntry(), effectBlock),
    true,
  );
});
