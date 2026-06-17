import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses Life face-up cost before shorthand field-count difference and composed K.O. targets", () => {
  const result = parseCardEffectLine(
    "[Main] You may turn 1 card from the top of your Life cards face-up: If you have less Characters than your opponent, K.O. up to 1 of your opponent's Characters with a cost of 6 or less and up to 1 of your opponent's Characters with a cost of 5 or less.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "turnLifeFaceUp",
                count: 1,
                player: "self",
                position: "top",
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                type: "fieldCountDifference",
                minuend: {
                  player: "opponent",
                  filter: { categories: ["character"] },
                },
                subtrahend: {
                  player: "self",
                  filter: { categories: ["character"] },
                },
                op: "gte",
                value: 1,
              },
              then: {
                type: "sequence",
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventMain",
      "composition:optionalCostedEffect",
      "cost:turnLifeFaceUp",
      "condition:fieldCountDifference",
      "instruction:ko",
      "composition:selectThenApply",
    ]),
  );
});
