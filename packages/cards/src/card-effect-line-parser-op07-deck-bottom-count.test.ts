import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses any-number filtered trash to deck bottom as available-card selection", () => {
  const result = parseCardEffectLine(
    "[When Attacking] Place any number of Character cards with a cost of 4 or more from your trash at the bottom of your deck in any order.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "whenAttacking" },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "trashSelection:self-trash-to-deck-placement",
            effect: {
              type: "selectCards",
              zone: "trash",
              player: "self",
              chooser: "self",
              min: 0,
              max: "available",
              filter: {
                categories: ["character"],
                cost: { min: 4 },
              },
            },
          },
          {
            effect: {
              type: "moveSelected",
              selection: "trashSelection:self-trash-to-deck-placement",
              from: "trash",
              to: "deck",
              position: "bottom",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:whenAttacking",
      "instruction:moveSelected",
      "count:anyNumber",
      "chooser:self",
      "zone:trash",
      "filter:category:character",
      "filter:cost",
      "condition:comparator:gte",
      "zone:deck",
      "position:bottom",
      "order:anyOrder",
      "composition:selectThenMove",
    ]),
  );
});

it("parses deck-bottom selected-count power gain as a reusable sequence consumer", () => {
  const result = parseCardEffectLine(
    "[When Attacking] Trash up to 1 of your opponent's Characters with a cost of 2 or less. Then, place any number of Character cards with a cost of 4 or more from your trash at the bottom of your deck in any order. This Character gains +1000 power during this turn for every 3 cards placed at the bottom of your deck.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "whenAttacking" },
      effect: {
        type: "sequence",
        effects: [
          {
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
                        cost: { max: 2 },
                      },
                    },
                  },
                },
                { effect: { type: "trash" } },
              ],
            },
          },
          {
            effect: {
              type: "sequence",
              effects: [
                {
                  saveResultAs: "trashSelection:self-trash-to-deck-placement",
                  effect: {
                    type: "selectCards",
                    zone: "trash",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: "available",
                    filter: {
                      categories: ["character"],
                      cost: { min: 4 },
                    },
                  },
                },
                {
                  effect: {
                    type: "moveSelected",
                    selection: "trashSelection:self-trash-to-deck-placement",
                    from: "trash",
                    to: "deck",
                    position: "bottom",
                  },
                },
              ],
            },
          },
          {
            effect: {
              type: "modifyPower",
              target: { type: "self" },
              value: {
                type: "selectedCardCount",
                selection: "trashSelection:self-trash-to-deck-placement",
                per: 3,
                multiplier: 1000,
              },
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:whenAttacking",
      "instruction:trash",
      "instruction:moveSelected",
      "instruction:modifyPower",
      "count:anyNumber",
      "count:selectedCardCount",
      "value:dynamic:selectedCardCount",
      "duration:thisTurn",
      "composition:selectThenMove",
      "composition:entryExpression",
    ]),
  );
});
