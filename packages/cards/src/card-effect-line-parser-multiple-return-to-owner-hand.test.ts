import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses multiple shared-destination return selections under an entry point", () => {
  const result = parseCardEffectLine(
    "[On Play] Return up to 1 Character with a cost of 8 or less and up to 1 Character with a cost of 3 or less to the owner's hand.",
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
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "anyPlayer",
                      zone: "characterArea",
                      min: 0,
                      max: 1,
                      filter: {
                        categories: ["character"],
                        cost: { max: 8 },
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "bounce",
                    destination: "hand",
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "anyPlayer",
                      zone: "characterArea",
                      min: 0,
                      max: 1,
                      filter: {
                        categories: ["character"],
                        cost: { max: 3 },
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "bounce",
                    destination: "hand",
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
      "instruction:returnToOwnerHand",
      "cardinality:upTo",
      "filter:cost",
      "destination:ownerHand",
      "composition:selectThenApply",
      "expression:sequence",
    ]),
  );
});
