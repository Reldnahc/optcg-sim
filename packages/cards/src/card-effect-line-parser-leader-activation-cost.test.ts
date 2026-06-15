import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses return-DON reminder costs into typed Leader activation", () => {
  const result = parseCardEffectLine(
    "[On Play] DON!! −1 (You may return the specified number of DON!! cards from your field to your DON!! deck.): Set up to 1 of your {Kid Pirates} type Leader as active.",
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
                type: "returnDon",
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
                      player: "self",
                      zone: "leaderArea",
                      min: 0,
                      max: 1,
                      filter: {
                        categories: ["leader"],
                        typesAny: ["Kid Pirates"],
                      },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "activate",
                    target: {
                      type: "savedFieldObject",
                      zone: "leaderArea",
                      player: "self",
                    },
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
      "entry:onPlay",
      "cost:returnDon",
      "instruction:activate",
      "cardinality:upTo",
      "zone:leaderArea",
      "filter:category:leader",
      "filter:type",
      "composition:selectThenApply",
    ]),
  );
});
