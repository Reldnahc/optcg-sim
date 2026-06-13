import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses optional hand-trash cost into only-matching Characters KO condition", () => {
  const result = parseCardEffectLine(
    "[On Play] You may trash 1 card from your hand: If you only have {Celestial Dragons} type Characters, K.O. up to 2 of your opponent's Characters with a base cost of 3 or less.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "trashFromHand",
                count: 1,
                chooser: "self",
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                type: "onlyMatchingFieldCards",
                zone: "characterArea",
                player: "self",
                filter: {
                  categories: ["character"],
                  typesAny: ["Celestial Dragons"],
                },
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "opponent",
                        zone: "characterArea",
                        max: 2,
                        filter: {
                          categories: ["character"],
                          baseCost: { max: 3 },
                        },
                      },
                    },
                  },
                  { effect: { type: "ko" } },
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
      "entry:onPlay",
      "composition:optionalCostedEffect",
      "cost:trashFromHand",
      "condition:onlyMatchingFieldCards",
      "instruction:ko",
      "cardinality:upTo",
      "filter:type",
      "filter:cost",
      "composition:selectThenApply",
    ]),
  );
});
