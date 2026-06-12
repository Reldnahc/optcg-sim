import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  EffectQueueEntry,
  SelectionId,
  SelectionSetId,
} from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

const syntheticEntry = (): EffectQueueEntry => ({
  id: "remainder-support-test-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "remainder-support-test-window" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: "p1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId:
      "p1:leader:remainder-source" as EffectQueueEntry["source"]["instanceId"],
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
      "p1:leader:remainder-source" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
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
    "remainder-support-test-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "remainder-support-test" },
});

test("sequence support accepts top-or-bottom placement for looked-set remainder", () => {
  const lookedSet = "set:looked-remainder-candidates" as SelectionSetId;
  const selection = "revealSelection:remainder-hand" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "remainder-support-test-effect" as EffectDefinition["effects"][number]["id"],
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
            type: "revealTop",
            player: "self",
            zone: "deck",
            count: 3,
            saveAs: lookedSet,
            visibility: "chooserOnly",
          },
        },
        {
          connector: "then",
          effect: {
            type: "selectFromSet",
            set: lookedSet,
            chooser: "self",
            min: 0,
            max: 1,
            filter: {},
            saveAs: selection,
          },
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            type: "moveSelected",
            selection,
            from: lookedSet,
            to: "hand",
          },
        },
        {
          connector: "then",
          effect: {
            type: "placeSetRemainder",
            set: lookedSet,
            owner: "self",
            destination: "deck",
            position: "topOrBottom",
            order: "chooser",
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support rejects original-order top-or-bottom looked-set remainder", () => {
  const lookedSet = "set:looked-remainder-candidates" as SelectionSetId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "remainder-support-test-effect" as EffectDefinition["effects"][number]["id"],
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
            type: "revealTop",
            player: "self",
            zone: "deck",
            count: 3,
            saveAs: lookedSet,
            visibility: "chooserOnly",
          },
        },
        {
          connector: "then",
          effect: {
            type: "placeSetRemainder",
            set: lookedSet,
            owner: "self",
            destination: "deck",
            position: "topOrBottom",
            order: "original",
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), false);
});
