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
  id: "sequence-support-selection-test-entry" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "sequence-support-selection-test-window" as EffectQueueEntry["timingWindowId"],
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
    "sequence-support-selection-test-effect" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "sequence-support-selection-test" },
});

test("sequence support accepts controller-selected opponent trash moved to owner deck bottom", () => {
  const selection = "trashSelection:owner-deck-bottom" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-selection-test-effect" as EffectDefinition["effects"][number]["id"],
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
            player: "opponent",
            chooser: "self",
            min: 0,
            max: 1,
            saveAs: selection,
            visibility: "bothPlayers",
          },
        },
        {
          connector: "then",
          effect: {
            type: "moveSelected",
            selection,
            from: "trash",
            to: "deck",
            position: "bottom",
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts all Characters moved to owner deck bottom", () => {
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-selection-test-effect" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "main" },
    optional: false,
    oncePerTurn: false,
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: {
      type: "bounce",
      destination: "deckBottom",
      target: {
        type: "all",
        player: "anyPlayer",
        zone: "characterArea",
        filter: { categories: ["character"], cost: { max: 3 } },
      },
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts single selected hand card movement to Life top", () => {
  const selection = "handSelection:self-hand-to-life-placement" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-selection-test-effect" as EffectDefinition["effects"][number]["id"],
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
            player: "self",
            zone: "hand",
            chooser: "self",
            visibility: "chooserOnly",
            min: 0,
            max: 1,
            saveAs: selection,
          },
        },
        {
          connector: "ifPossible",
          effect: {
            type: "moveSelected",
            selection,
            from: "hand",
            to: "life",
            position: "top",
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts selected Life cards moved to trash", () => {
  const selection = "lifeSelection:opponent-life-to-trash" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-selection-test-effect" as EffectDefinition["effects"][number]["id"],
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
            player: "opponent",
            zone: "life",
            chooser: "self",
            visibility: "chooserOnly",
            min: 0,
            max: 1,
            saveAs: selection,
          },
        },
        {
          connector: "ifPossible",
          effect: {
            type: "moveSelected",
            selection,
            from: "life",
            to: "trash",
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts selected Life cards moved to hand", () => {
  const selection = "lifeSelection:opponent-life-to-hand" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-selection-test-effect" as EffectDefinition["effects"][number]["id"],
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
            player: "opponent",
            zone: "life",
            chooser: "opponent",
            visibility: "chooserOnly",
            min: 1,
            max: 1,
            saveAs: selection,
          },
        },
        {
          connector: "ifPossible",
          effect: {
            type: "moveSelected",
            selection,
            from: "life",
            to: "hand",
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts choosing from a saved revealed hand selection", () => {
  const revealed = "handSelection:revealed-hand-cards" as SelectionId;
  const revealedSet = "handSelection:revealed-hand-cards" as SelectionSetId;
  const chosen = "handSelection:chosen-revealed-hand-card" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-selection-test-effect" as EffectDefinition["effects"][number]["id"],
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
          saveResultAs: revealed,
          effect: {
            type: "selectCards",
            player: "self",
            zone: "hand",
            chooser: "self",
            visibility: "bothPlayers",
            min: 0,
            max: 2,
            saveAs: revealed,
            filter: { categories: ["character"] },
          },
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            type: "selectFromSet",
            set: revealedSet,
            chooser: "self",
            min: 1,
            max: 1,
            saveAs: chosen,
          },
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            type: "playSelected",
            selection: chosen,
            ignoreCost: true,
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts filtered hand card movement to Life face-up", () => {
  const selection = "handSelection:self-hand-to-life-placement" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-selection-test-effect" as EffectDefinition["effects"][number]["id"],
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
            player: "self",
            zone: "hand",
            chooser: "self",
            visibility: "chooserOnly",
            min: 0,
            max: 1,
            saveAs: selection,
            filter: {
              categories: ["character"],
              typesAny: ["Supernovas"],
              cost: { op: "eq", value: 5 },
            },
          },
        },
        {
          connector: "ifPossible",
          effect: {
            type: "moveSelected",
            selection,
            from: "hand",
            to: "life",
            position: "top",
            destinationFaceUp: true,
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts revealed hand card movement to Life face-down", () => {
  const selection = "handSelection:self-hand-to-life-placement" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-selection-test-effect" as EffectDefinition["effects"][number]["id"],
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
            player: "self",
            zone: "hand",
            chooser: "self",
            visibility: "bothPlayers",
            min: 0,
            max: 1,
            saveAs: selection,
            filter: {
              categories: ["character"],
              typesAny: ["Supernovas"],
            },
          },
        },
        {
          connector: "ifPossible",
          effect: {
            type: "moveSelected",
            selection,
            from: "hand",
            to: "life",
            position: "top",
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support rejects multi-card selected hand movement to Life without ordering support", () => {
  const selection = "handSelection:self-hand-to-life-placement" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-selection-test-effect" as EffectDefinition["effects"][number]["id"],
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
            player: "self",
            zone: "hand",
            chooser: "self",
            visibility: "chooserOnly",
            min: 0,
            max: 2,
            saveAs: selection,
          },
        },
        {
          connector: "ifPossible",
          effect: {
            type: "moveSelected",
            selection,
            from: "hand",
            to: "life",
            position: "top",
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), false);
});
