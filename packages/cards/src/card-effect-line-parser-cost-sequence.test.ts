import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses comma-separated return-DON plus hand-trash costs into one optional cost sequence", () => {
  expect(
    parseCardEffectLine(
      "[On Play] DON!! -2, You may trash 1 card from your hand: Draw 2 cards.",
    ),
  ).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "sequence",
                optional: true,
                costs: [
                  { type: "returnDon", count: 2 },
                  { type: "trashFromHand", count: 1, chooser: "self" },
                ],
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", player: "self", count: 2 },
          },
        ],
      },
    },
    evidence: [
      "entry:onPlay",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:returnDon",
      "count:positiveInteger",
      "cost:trashFromHand",
      "count:positiveInteger",
      "chooser:self",
      "instruction:draw",
      "count:positiveInteger",
      "player:self",
      "composition:entryExpression",
    ],
  });
});

it("parses active leader power reduction as an optional cost before draw", () => {
  expect(
    parseCardEffectLine(
      "[On Play] You may give your active Leader -5000 power during this turn: Draw 1 card.",
    ),
  ).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "modifyPower",
                target: { type: "myLeader" },
                requiredState: "active",
                value: -5000,
                duration: { type: "thisTurn" },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
    evidence: [
      "entry:onPlay",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "cost:modifyPower",
      "target:yourLeader",
      "state:active",
      "modifier:negativePower",
      "duration:thisTurn",
      "instruction:draw",
      "count:positiveInteger",
      "player:self",
      "composition:entryExpression",
    ],
  });
});

it("parses active DON attachment and trash-self as reusable optional cost sequence", () => {
  expect(
    parseCardEffectLine(
      "[Activate: Main] You may give 1 of your active DON!! cards to 1 of your Leader or Character cards and trash this Character: Give up to 1 of your opponent's Characters -3000 power during this turn.",
    ),
  ).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "sequence",
                optional: true,
                costs: [
                  {
                    type: "attachDon",
                    count: 1,
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
                        filter: { categories: ["leader", "character"] },
                      },
                    },
                  },
                  { type: "trashSelf" },
                ],
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              target: {
                type: "choose",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "opponent",
                  zone: "characterArea",
                  min: 0,
                  max: 1,
                  allowFewerIfUnavailable: true,
                  visibility: "public",
                  filter: { categories: ["character"] },
                },
              },
              value: -3000,
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
    evidence: [
      "entry:activateMain",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:attachDon",
      "cardinality:exact",
      "count:positiveInteger",
      "state:active",
      "target:yourDonCards",
      "target:yourLeaderOrCharacters",
      "player:self",
      "filter:category:leader",
      "filter:category:character",
      "cost:trashSelf",
      "target:thisCharacter",
      "instruction:modifyPower",
      "cardinality:upTo",
      "count:positiveInteger",
      "chooser:self:upTo",
      "player:opponent",
      "target:opponentCharacters",
      "filter:category:character",
      "modifier:negativePower",
      "duration:thisTurn",
      "composition:entryExpression",
    ],
  });
});

it("parses return-DON cost into temporary keyword grant then hand-trash sequence", () => {
  expect(
    parseCardEffectLine(
      "[Activate: Main] DON!! -1: This Character gains [Blocker] until the end of your opponent's next End Phase. Then, trash 1 card from your hand.",
    ),
  ).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: { type: "returnDon", count: 1, optional: true },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "giveKeyword",
                    target: { type: "self" },
                    keyword: "blocker",
                    duration: {
                      type: "untilEndOfNextTurn",
                      player: "opponent",
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "trashFromHand",
                    count: 1,
                    player: "self",
                    chooser: "self",
                  },
                },
              ],
            },
          },
        ],
      },
    },
    evidence: [
      "entry:activateMain",
      "sourcePresence:mustRemain",
      "composition:costedEffect",
      "cost:returnDon",
      "count:positiveInteger",
      "expression:sequence",
      "instruction:giveKeyword",
      "target:thisCharacter",
      "keyword:anySupported",
      "duration:opponentNextEndPhase",
      "connector:then",
      "instruction:trashFromHand",
      "count:positiveInteger",
      "player:self",
      "chooser:self",
      "composition:entryExpression",
    ],
  });
});
