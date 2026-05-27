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
