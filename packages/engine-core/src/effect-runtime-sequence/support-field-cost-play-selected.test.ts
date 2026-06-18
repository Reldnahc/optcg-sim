import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  EffectQueueEntry,
  SelectionId,
} from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const activateMainEntry = (): EffectQueueEntry => ({
  id: "queue-entry:activate-main:field-cost-play-test" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "timing-window:activate-main:field-cost-play-test" as EffectQueueEntry["timingWindowId"],
  queueOrigin: { type: "activateMain" },
  generation: 0,
  controllerId: "p1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId:
      "p1:character:source" as EffectQueueEntry["source"]["instanceId"],
    cardId: "TEST-001" as EffectQueueEntry["source"]["cardId"],
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
    cardId: "TEST-001" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
    controllerId: "p1" as EffectQueueEntry["sourceSnapshot"]["controllerId"],
    zone: {
      zone: "characterArea",
      playerId: "p1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
      slot: "character",
      index: 0,
    },
    category: "character",
    colors: ["green"],
    keywords: [],
    power: 6000,
  },
  effectBlockId:
    "field-cost-play-test-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "effectRuntime:activateMain" },
});

test("sequence support accepts optional filtered field-trash cost before trash playSelected", () => {
  const selection = "trashSelection:field-cost-play" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-field-trash-cost-play" as EffectDefinition["effects"][number]["id"],
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
              type: "trashFromField",
              optional: true,
              chooser: "self",
              count: 1,
              filter: {
                categories: ["character"],
                currentPower: { min: 6000 },
              },
            },
          },
        },
        {
          connector: "ifYouDo",
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
              typesAny: ["FILM"],
              power: { min: 2000, max: 5000 },
            },
            saveAs: selection,
            visibility: "bothPlayers",
          },
        },
        {
          connector: "ifPossible",
          effect: {
            type: "playSelected",
            selection,
            ignoreCost: true,
            enterRested: true,
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
