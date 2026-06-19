import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses leader type or type-including alternatives under On Play movement effects", () => {
  const result = parseCardEffectLine(
    "[Your Turn] [On Play] If your Leader has the {Cross Guild} type or a type including \"Baroque Works\", place up to 1 of your opponent's Characters with 2000 power or less at the bottom of the owner's deck.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      condition: { type: "and" },
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  currentPower: { max: 2000 },
                },
              },
            },
          },
          {
            effect: {
              type: "bounce",
              destination: "deckBottom",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "condition:yourTurn",
      "condition:leaderIdentity",
      "filter:anyOf",
      "filter:type",
      "instruction:moveSelected",
      "filter:currentPower",
      "destination:deck",
      "position:bottom",
    ]),
  );
});
