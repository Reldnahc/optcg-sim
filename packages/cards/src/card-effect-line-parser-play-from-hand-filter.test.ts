import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses conditional play-from-hand rested with separated type-or-attribute filters", () => {
  expect(
    parseCardEffectLine(
      "[On Play] If you have 2 or less Characters, play up to 1 {Muggy Kingdom} type or <Slash> attribute Character card with a cost of 4 or less other than [Dracule Mihawk] from your hand rested.",
    ),
  ).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["character"] },
        op: "lte",
        value: 2,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                anyOf: [
                  { typesAny: ["Muggy Kingdom"] },
                  { attributesAny: ["slash"] },
                ],
                categories: ["character"],
                cost: { max: 4 },
                nameNot: ["Dracule Mihawk"],
              },
            },
          },
          {
            effect: {
              type: "playSelected",
              selection: "handSelection:play-from-hand",
              ignoreCost: true,
              enterRested: true,
            },
          },
        ],
      },
    },
  });
});

it("parses exact DON conditional play followed by opponent life movement", () => {
  const result = parseCardEffectLine(
    "[Main] If you have 10 DON!! cards on your field, play up to 1 [Marshall.D.Teach] from your hand. Then, add up to 1 card from the top of your opponent's Life cards to the owner's hand.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["don"] },
        op: "eq",
        value: 10,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "hand",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: { names: ["Marshall.D.Teach"] },
                  },
                },
                {
                  effect: {
                    type: "playSelected",
                    selection: "handSelection:play-from-hand",
                    ignoreCost: true,
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "moveCards",
              min: 0,
              count: 1,
              from: {
                player: "opponent",
                zone: "life",
                position: "top",
              },
              to: {
                player: "owner",
                zone: "hand",
              },
              order: "original",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "condition:donFieldCount",
      "condition:comparator:eq",
      "instruction:playSelected",
      "filter:name",
      "instruction:moveCards",
      "destination:ownerHand",
      "composition:entryExpression",
    ]),
  );
});
