import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses trash-to-bottom return wording as the same move-cards cost before K.O.", () => {
  const result = parseCardEffectLine(
    "[On Play] You may return 2 cards from your trash to the bottom of your deck in any order: K.O. up to 1 Character with a cost of 2 or less.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                count: 2,
                from: { player: "self", zone: "trash" },
                to: { player: "self", zone: "deck", position: "bottom" },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
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
                { effect: { type: "ko" } },
              ],
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
      "cost:moveCards",
      "zone:trash",
      "destination:deck",
      "position:bottom",
      "order:anyOrder",
      "instruction:ko",
    ]),
  );
});

it("reuses trash-to-bottom return cost before a trash-to-hand body", () => {
  const result = parseCardEffectLine(
    "[On Play] You may return 2 cards from your trash to the bottom of your deck in any order: Add up to 1 {Thriller Bark Pirates} type card other than [Dr. Hogback] from your trash to your hand.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                count: 2,
                from: { player: "self", zone: "trash" },
                to: { player: "self", zone: "deck", position: "bottom" },
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "trash",
                    min: 0,
                    max: 1,
                    filter: {
                      typesAny: ["Thriller Bark Pirates"],
                      nameNot: ["Dr. Hogback"],
                    },
                  },
                },
                { effect: { type: "moveSelected", to: "hand" } },
              ],
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
      "cost:moveCards",
      "zone:trash",
      "destination:deck",
      "position:bottom",
      "instruction:moveSelected",
      "destination:hand",
      "filter:type",
      "filter:nameNot",
    ]),
  );
});
