import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses hand-played no-base-effect reactions with conditional DON activation bodies", () => {
  const result = parseCardEffectLine(
    "[Once Per Turn] When you play a Character with no base effect from your hand, if you have 3 or less Characters, set up to 2 of your DON!! cards as active.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      oncePerTurn: true,
      trigger: {
        type: "cardPlayed",
        player: "self",
        sourceZone: "hand",
        filter: {
          categories: ["character"],
          effectEntryPoint: { mode: "without", trigger: { type: "onPlay" } },
        },
      },
      effect: {
        type: "conditional",
        if: {
          type: "fieldCount",
          player: "self",
          op: "lte",
          value: 3,
        },
        then: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "selectTargets",
                request: {
                  player: "self",
                  zone: "costArea",
                  min: 0,
                  max: 2,
                  filter: { categories: ["don"], state: "rested" },
                },
              },
            },
            {
              effect: { type: "activate" },
            },
          ],
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "trigger:cardPlayed",
      "zone:hand",
      "filter:effectEntryPoint:without",
      "condition:fieldCount",
      "instruction:activate",
      "target:yourDonCards",
      "composition:selectThenApply",
    ]),
  );
});
