import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  EffectQueueEntry,
  HandSelectionId,
  SelectionId,
} from "@optcg/types";

import { isSupportedSequenceBlock } from "./effect-runtime-sequence-support.js";

const syntheticEntry = (): EffectQueueEntry => ({
  id: "sequence-support-test-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "sequence-support-test-window" as EffectQueueEntry["timingWindowId"],
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
    "sequence-support-test-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "sequence-support-test" },
});

test("sequence support accepts targeted keyword grants filtered by reusable effect entry point", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-test-effect" as EffectDefinition["effects"][number]["id"],
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
            type: "giveKeyword",
            target: {
              type: "choose",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "self",
                zone: "characterArea",
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
                filter: {
                  categories: ["character"],
                  effectEntryPoint: {
                    mode: "without",
                    trigger: { type: "whenAttacking" },
                  },
                },
              },
            },
            keyword: "rush",
            duration: { type: "thisTurn" },
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts selected field-object trash consumers", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-test-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "onPlay" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: {
      type: "sequence",
      effects: [
        {
          id: "select-trash-target",
          connector: "always",
          saveResultAs: "selected:trash-target",
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
              filter: {
                categories: ["character"],
                currentPower: { max: 6000 },
              },
            },
          },
        },
        {
          id: "trash-selected-target",
          connector: "then",
          effect: {
            type: "trash",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: "selected:trash-target",
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

test("sequence support accepts hand play followed by reusable play restriction", () => {
  const selection = "handSelection:play-from-hand" as HandSelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-test-effect" as EffectDefinition["effects"][number]["id"],
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
            type: "sequence",
            effects: [
              {
                connector: "always",
                saveResultAs: "handSelection:play-from-hand",
                effect: {
                  type: "selectCards",
                  zone: "hand",
                  player: "self",
                  chooser: "self",
                  min: 0,
                  max: 1,
                  filter: {
                    categories: ["character"],
                    typesAny: ["Alabasta", "Straw Hat Crew"],
                    cost: { max: 5 },
                  },
                  saveAs: selection,
                  visibility: "chooserOnly",
                },
              },
              {
                connector: "ifPossible",
                effect: {
                  type: "playSelected",
                  selection,
                  ignoreCost: true,
                },
              },
            ],
          },
        },
        {
          connector: "then",
          effect: {
            type: "preventPlay",
            player: "self",
            filter: { categories: ["character"] },
            duration: { type: "thisTurn" },
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts opponent hand selection moved to deck bottom", () => {
  const selection = "handSelection:opponent-hand-to-deck-bottom" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-test-effect" as EffectDefinition["effects"][number]["id"],
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
            zone: "hand",
            player: "opponent",
            chooser: "opponent",
            min: 1,
            max: 1,
            saveAs: selection,
            visibility: "chooserOnly",
          },
        },
        {
          connector: "then",
          effect: {
            type: "moveSelected",
            selection,
            from: "hand",
            to: "deck",
            position: "bottom",
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});
