import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("set base cost parser", () => {
  it("parses targeted base-cost set with reusable no-base-effect filter", () => {
    const result = parseCardEffectLine(
      "[On Play] Set the cost of up to 1 of your opponent's Characters with no base effect to 0 during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              saveResultAs: "selected:base-cost-target",
              effect: {
                type: "selectTargets",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "opponent",
                  zone: "characterArea",
                  min: 0,
                  max: 1,
                  filter: {
                    categories: ["character"],
                    effectEntryPoint: {
                      mode: "without",
                      trigger: { type: "onPlay" },
                    },
                  },
                },
              },
            },
            {
              connector: "then",
              effect: {
                type: "setBaseCost",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "selectedTargets",
                    saveResultAs: "selected:base-cost-target",
                  },
                  player: "opponent",
                  zone: "characterArea",
                },
                value: 0,
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
        "instruction:setBaseCost",
        "cardinality:upTo",
        "target:opponentCharacters",
        "filter:effectEntryPoint",
        "filter:effectEntryPoint:without",
        "duration:thisTurn",
      ]),
    );
  });
});
