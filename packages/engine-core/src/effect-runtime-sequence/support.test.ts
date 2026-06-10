import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  EffectQueueEntry,
  HandSelectionId,
  SelectionId,
  SelectionSetId,
} from "@optcg/types";

import { isSupportedSequenceBlock } from "./support.js";

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

const activateMainEntry = (): EffectQueueEntry => ({
  ...syntheticEntry(),
  id: "queue-entry:activate-main:sequence-support-test:source:effect" as EffectQueueEntry["id"],
  timingWindowId:
    "timing-window:activate-main:sequence-support-test" as EffectQueueEntry["timingWindowId"],
  causedBy: { type: "ruleProcess", name: "effectRuntime:activateMain" },
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

test("sequence support accepts conditional bodies with continuous target decisions", () => {
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
            type: "payCost",
            cost: { type: "trashSelf", optional: true },
          },
        },
        {
          connector: "ifYouDo",
          effect: {
            type: "conditional",
            if: {
              type: "hasCardInZone",
              player: "self",
              zone: "leaderArea",
              filter: {
                categories: ["leader"],
                typesAny: ["Land of Wano"],
              },
            },
            then: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: { type: "draw", player: "self", count: 1 },
                },
                {
                  connector: "then",
                  effect: {
                    type: "modifyCost",
                    player: "self",
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
                        filter: { categories: ["character"] },
                      },
                    },
                    value: 20,
                    duration: { type: "thisTurn" },
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

test("sequence support accepts conditional playSelected after optional self-trash costs", () => {
  const selection = "trashSelection:play" as SelectionId;
  const effectBlock: EffectDefinition["effects"][number] = {
    id: "sequence-support-test-effect" as EffectDefinition["effects"][number]["id"],
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
              type: "trashSelf",
              optional: true,
              filter: { categories: ["character"], cost: { min: 20 } },
            },
          },
        },
        {
          connector: "ifYouDo",
          effect: {
            type: "conditional",
            if: {
              type: "fieldCount",
              player: "self",
              filter: { categories: ["don"] },
              op: "gte",
              value: 9,
            },
            then: {
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
                      names: ["Kouzuki Momonosuke"],
                      cost: { op: "eq", value: 9 },
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

test("sequence support accepts select-all targets followed by attack trash cost", () => {
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
          saveResultAs: "selected:attack-cost-targets",
          effect: {
            type: "selectAllTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zone: "characterArea",
              filter: { categories: ["character"] },
              visibility: "public",
            },
          } as never,
        },
        {
          connector: "then",
          effect: {
            type: "attackCost",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: "selected:attack-cost-targets",
              },
              zone: "characterArea",
              player: "opponent",
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
            cost: { type: "trashFromHand", count: 2 },
            duration: { type: "untilEndOfNextTurn", player: "opponent" },
          } as never,
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

test("sequence support accepts looked-set selection moved to Life top before bottoming remainder", () => {
  const lookedSet = "set:looked-life-candidates" as SelectionSetId;
  const selection = "revealSelection:life" as SelectionId;
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
            to: "life",
            position: "top",
          },
        },
        {
          connector: "then",
          effect: {
            type: "placeSetRemainder",
            set: lookedSet,
            owner: "self",
            destination: "deck",
            position: "bottom",
            order: "chooser",
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts looked-set selection moved to Life bottom face-up", () => {
  const lookedSet = "set:looked-life-candidates" as SelectionSetId;
  const selection = "revealSelection:life" as SelectionId;
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
            type: "revealTop",
            player: "self",
            zone: "deck",
            count: 5,
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
            filter: { typesAny: ["Blackbeard Pirates"] },
            saveAs: selection,
          },
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            type: "revealSelected",
            selection,
            visibility: "bothPlayers",
          },
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            type: "moveSelected",
            selection,
            from: lookedSet,
            to: "life",
            position: "bottom",
            destinationFaceUp: true,
          },
        },
        {
          connector: "then",
          effect: {
            type: "placeSetRemainder",
            set: lookedSet,
            owner: "self",
            destination: "deck",
            position: "bottom",
            order: "chooser",
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts selected trash cards moved to Life bottom", () => {
  const selection = "trashSelection:addToLife" as SelectionId;
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
            zone: "trash",
            player: "self",
            chooser: "self",
            min: 0,
            max: 1,
            filter: {
              categories: ["character"],
              cost: { max: 4 },
            },
            saveAs: selection,
            visibility: "bothPlayers",
          },
        },
        {
          connector: "ifPossible",
          effect: {
            type: "moveSelected",
            selection,
            from: "trash",
            to: "life",
            position: "bottom",
          },
        },
      ],
    },
  };

  assert.equal(isSupportedSequenceBlock(syntheticEntry(), effectBlock), true);
});

test("sequence support accepts saved restriction followed by owner deck-bottom bounce", () => {
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
                id: "select-cannot-attack",
                connector: "always",
                saveResultAs: "selected:thatCharacter",
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
                      nameNot: ["Monkey.D.Luffy"],
                    },
                  },
                },
              },
              {
                connector: "then",
                effect: {
                  type: "cannotAttack",
                  target: {
                    type: "savedFieldObject",
                    binding: {
                      family: "selectedTargets",
                      saveResultAs: "selected:thatCharacter",
                    },
                    zone: "characterArea",
                    player: "opponent",
                    visibility: "publicOnly",
                    onFailure: "failClosed",
                  },
                  duration: {
                    type: "untilEndOfNextTurn",
                    player: "opponent",
                  },
                },
              },
            ],
          },
        },
        {
          connector: "then",
          effect: {
            type: "sequence",
            effects: [
              {
                id: "select-owner-deck-bottom",
                connector: "always",
                saveResultAs: "selected:owner-deck-bottom",
                effect: {
                  type: "selectTargets",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "anyPlayer",
                    zone: "characterArea",
                    min: 0,
                    max: 1,
                    allowFewerIfUnavailable: true,
                    visibility: "public",
                    filter: {
                      categories: ["character"],
                      cost: { max: 1 },
                    },
                  },
                },
              },
              {
                connector: "then",
                effect: {
                  type: "bounce",
                  destination: "deckBottom",
                  target: {
                    type: "savedFieldObject",
                    binding: {
                      family: "selectedTargets",
                      saveResultAs: "selected:owner-deck-bottom",
                    },
                    zone: "characterArea",
                    player: "anyPlayer",
                    visibility: "publicOnly",
                    onFailure: "failClosed",
                  },
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
