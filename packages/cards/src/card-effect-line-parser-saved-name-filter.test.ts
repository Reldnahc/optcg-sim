import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses optional hand-trash cost followed by same-name trash play", () => {
  const result = parseCardEffectLine(
    "[Main] You may trash 1 {GERMA 66} type Character card with 4000 power or less from your hand: If the number of DON!! cards on your field is equal to or less than the number on your opponent's field, play up to 1 Character card with 5000 to 7000 power and the same card name as the trashed card from your trash.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
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
                filter: {
                  categories: ["character"],
                  typesAny: ["GERMA 66"],
                  power: { max: 4000 },
                },
                optional: true,
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
                  filter: { categories: ["don"] },
                },
                subtrahend: {
                  player: "self",
                  filter: { categories: ["don"] },
                },
                op: "gte",
                value: 0,
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectCards",
                      zone: "trash",
                      player: "self",
                      chooser: "self",
                      min: 0,
                      max: 1,
                      filter: {
                        categories: ["character"],
                        power: { min: 5000, max: 7000 },
                        nameRelation: {
                          type: "sameAsSavedCards",
                          selection: "paidCost",
                        },
                      },
                    },
                  },
                  {
                    effect: {
                      type: "playSelected",
                      selection: "trashSelection:play",
                      ignoreCost: true,
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
      "entry:eventMain",
      "composition:optionalCostedEffect",
      "cost:trashFromHand",
      "filter:type",
      "filter:category:character",
      "filter:power",
      "condition:fieldCountDifference",
      "instruction:playSelected",
      "filter:nameRelation",
      "zone:trash",
      "composition:selectThenPlay",
    ]),
  );
});
