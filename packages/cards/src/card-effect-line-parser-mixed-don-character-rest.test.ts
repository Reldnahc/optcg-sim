import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses opponent DON or filtered Character rest as mixed-zone alternatives", () => {
  const result = parseCardEffectLine(
    "[On Play] If you have 2 or more rested Characters, rest up to 1 of your opponent's DON!! cards or Characters with a cost of 6 or less.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      condition: {
        type: "fieldCount",
        player: "self",
        op: "gte",
        value: 2,
        filter: {
          categories: ["character"],
          state: "rested",
        },
      },
      effect: {
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            player: "opponent",
            zones: ["characterArea", "costArea"],
            min: 0,
            max: 1,
            filter: {
              anyOf: [
                { categories: ["don"] },
                {
                  categories: ["character"],
                  cost: { max: 6 },
                },
              ],
            },
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "expression:conditional",
      "condition:fieldCount",
      "instruction:rest",
      "target:opponentCharactersOrDonCards",
      "zone:characterArea",
      "zone:costArea",
      "filter:anyOf",
      "filter:category:don",
      "filter:category:character",
      "filter:cost",
    ]),
  );
});
