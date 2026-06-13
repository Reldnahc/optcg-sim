import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses activate-main sequenced rest cost before conditional search", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may rest 1 of your DON!! cards and this Character: If your Leader is [Roronoa Zoro], look at 5 cards from the top of your deck; reveal up to 1 <Slash> attribute card or green Event and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: {
                type: "sequence",
                costs: [{ type: "restDon", count: 1 }, { type: "restSelf" }],
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                type: "hasCardInZone",
                zone: "leaderArea",
                player: "self",
                filter: { categories: ["leader"], names: ["Roronoa Zoro"] },
              },
              then: {
                type: "sequence",
                effects: [
                  { effect: { type: "revealTop", count: 5 } },
                  {
                    effect: {
                      type: "selectFromSet",
                      filter: {
                        anyOf: [
                          { attributesAny: ["slash"] },
                          { colorsAny: ["green"], categories: ["event"] },
                        ],
                      },
                    },
                  },
                  { effect: { type: "revealSelected" } },
                  { effect: { type: "moveSelected", to: "hand" } },
                  {
                    effect: {
                      type: "placeSetRemainder",
                      position: "bottom",
                    },
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
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:restDon",
      "cost:restSelf",
      "condition:leaderIdentity",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:revealSelected",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      "filter:anyOf",
      "filter:attribute",
      "filter:category:event",
    ]),
  );
});
