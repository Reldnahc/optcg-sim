import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses trailing conditional draw as reusable condition plus draw primitives", () => {
  expect(
    parseCardEffectLine(
      "[On Play] Draw 4 cards if your opponent has 3 or less Life cards.",
    ),
  ).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "conditional",
        if: {
          type: "lifeCount",
          player: "opponent",
          op: "lte",
          value: 3,
        },
        then: { type: "draw", count: 4, player: "self" },
      },
    },
    evidence: [
      "entry:onPlay",
      "sourcePresence:mustRemain",
      "expression:conditional",
      "condition:lifeCount",
      "condition:comparator:lte",
      "condition:threshold:positiveInteger",
      "player:opponent",
      "instruction:draw",
      "count:positiveInteger",
      "player:self",
      "composition:entryExpression",
    ],
  });
});
