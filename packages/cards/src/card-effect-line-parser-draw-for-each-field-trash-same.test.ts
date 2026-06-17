import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses draw-for-each matching field card and same-number hand trash as dynamic counts", () => {
  const result = parseCardEffectLine(
    "[On Play] Draw a card for each of your {Neptunian} type Characters. Then, trash the same number of cards from your hand.",
  );

  const count = {
    type: "countMatchingFieldCards",
    player: "self",
    zone: "characterArea",
    filter: {
      categories: ["character"],
      typesAny: ["Neptunian"],
    },
    multiplier: 1,
  };

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "draw", player: "self", count },
          },
          {
            connector: "then",
            effect: {
              type: "trashFromHand",
              player: "self",
              chooser: "self",
              count,
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:draw",
      "instruction:trashFromHand",
      "valueSource:fieldCount",
      "filter:type",
      "filter:category:character",
      "composition:entryExpression",
    ]),
  );
});
