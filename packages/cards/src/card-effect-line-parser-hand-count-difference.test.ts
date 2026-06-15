import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses rest-self cost into hand-count difference conditional draw-trash", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may rest this Character: If the number of cards in your hand is at least 3 less than the number in your opponent's hand, draw 2 cards and trash 1 card from your hand.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: { type: "restSelf", optional: true },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                type: "handCountDifference",
                minuend: { player: "opponent" },
                subtrahend: { player: "self" },
                op: "gte",
                value: 3,
              },
              then: {
                type: "sequence",
                effects: [
                  { connector: "always", effect: { type: "draw", count: 2 } },
                  {
                    connector: "then",
                    effect: { type: "trashFromHand", count: 1 },
                  },
                ],
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "cost:restSelf",
      "condition:handCountDifference",
      "valueOffset:handCountDifference",
      "instruction:draw",
      "instruction:trashFromHand",
    ]),
  );
});
