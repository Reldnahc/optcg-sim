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
