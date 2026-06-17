import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses selected opponent character current power set to zero", () => {
  const result = parseCardEffectLine(
    "[On Play] Set the power of up to 1 of your opponent's Characters to 0 during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "selected:power-zero-target",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: { categories: ["character"] },
                allowFewerIfUnavailable: true,
                visibility: "public",
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "setPowerToZero",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "selected:power-zero-target",
                },
                zone: "characterArea",
                player: "opponent",
                visibility: "publicOnly",
                onFailure: "failClosed",
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
      "entry:onPlay",
      "instruction:setPowerToZero",
      "cardinality:upTo",
      "count:positiveInteger",
      "target:opponentCharacters",
      "player:opponent",
      "duration:thisTurn",
      "composition:selectThenApply",
      "composition:entryExpression",
    ]),
  );
});
