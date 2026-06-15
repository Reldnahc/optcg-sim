import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses opponent-more-than-self DON field conditions under action entries", () => {
  const result = parseCardEffectLine(
    "[On Play] If your opponent has more DON!! cards on their field than you, K.O. up to 1 of your opponent's Characters with a cost of 3 or less.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      condition: {
        type: "fieldCountDifference",
        minuend: {
          player: "opponent",
          filter: { categories: ["don"] },
        },
        subtrahend: {
          player: "self",
          filter: { categories: ["don"] },
        },
        op: "gte",
        value: 1,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "selectTargets" },
          },
          {
            connector: "then",
            effect: { type: "ko" },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "condition:fieldCountDifference",
      "player:opponent",
      "player:self",
      "filter:category:don",
      "instruction:ko",
    ]),
  );
});
