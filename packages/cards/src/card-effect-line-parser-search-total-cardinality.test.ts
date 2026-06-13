import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses public search with total cardinality across type and name alternatives", () => {
  const result = parseCardEffectLine(
    "[Main] Look at 5 cards from the top of your deck; reveal a total of up to 2 {Shandian Warrior} type Character cards or [Mont Blanc Noland] and add them to your hand. Then, place the rest at the bottom of your deck in any order.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "revealTop", count: 5 } },
          {
            effect: {
              type: "selectFromSet",
              min: 0,
              max: 2,
              filter: {
                anyOf: [
                  {
                    categories: ["character"],
                    typesAny: ["Shandian Warrior"],
                  },
                  { names: ["Mont Blanc Noland"] },
                ],
              },
            },
          },
          { effect: { type: "revealSelected" } },
          { effect: { type: "moveSelected", to: "hand" } },
          { effect: { type: "placeSetRemainder", position: "bottom" } },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventMain",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:revealSelected",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      "filter:anyOf",
      "filter:type",
      "filter:category:character",
      "filter:name",
      "remaining:bottomDeck",
    ]),
  );
});
