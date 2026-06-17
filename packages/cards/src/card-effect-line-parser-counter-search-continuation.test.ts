import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses Counter power followed by public top-deck type Character search", () => {
  const result = parseCardEffectLine(
    "[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, look at 3 cards from the top of your deck; reveal up to 1 {Donquixote Pirates} type Character card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "counter" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "modifyPower",
              value: 4000,
              duration: { type: "thisBattle" },
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "revealTop",
                    count: 3,
                    zone: "deck",
                    saveAs: "set:search-look",
                  },
                },
                {
                  effect: {
                    type: "selectFromSet",
                    set: "set:search-look",
                    min: 0,
                    max: 1,
                    filter: {
                      categories: ["character"],
                      typesAny: ["Donquixote Pirates"],
                    },
                  },
                },
                {
                  effect: {
                    type: "revealSelected",
                    visibility: "bothPlayers",
                  },
                },
                {
                  effect: {
                    type: "moveSelected",
                    to: "hand",
                  },
                },
                {
                  effect: {
                    type: "placeSetRemainder",
                    destination: "deck",
                    position: "bottom",
                    order: "chooser",
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventCounter",
      "instruction:modifyPower",
      "duration:thisBattle",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:revealSelected",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      "filter:type",
      "filter:category:character",
    ]),
  );
});
