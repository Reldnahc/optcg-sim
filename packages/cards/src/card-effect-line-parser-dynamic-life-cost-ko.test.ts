import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses opponent Character K.O. filtered by self Life count as reusable dynamic stat data", () => {
  const result = parseCardEffectLine(
    "[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a cost equal to or less than your number of Life cards.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "trashFromHand",
                count: 1,
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
                  connector: "always",
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      min: 0,
                      max: 1,
                      filter: {
                        categories: ["character"],
                        statComparisons: [
                          {
                            stat: "cost",
                            op: "lte",
                            value: {
                              type: "countMatchingZoneCards",
                              player: "self",
                              zone: "life",
                              per: 1,
                              multiplier: 1,
                            },
                          },
                        ],
                      },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: { type: "ko" },
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
      "entry:onPlay",
      "cost:trashFromHand",
      "instruction:ko",
      "target:opponentCharacters",
      "filter:cost",
      "condition:comparator:lte",
      "valueSource:lifeCount:self",
      "composition:selectThenApply",
    ]),
  );
});
