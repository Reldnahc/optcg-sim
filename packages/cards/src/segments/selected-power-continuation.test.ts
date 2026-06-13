import { describe, expect, it } from "vitest";

import { selectedPowerContinuationExpressionParser } from "./selected-power-continuation.js";

describe("selected power continuation expression parser", () => {
  it("saves a selected power target and applies an additional modifier to that card", () => {
    const result = selectedPowerContinuationExpressionParser({
      text: "up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, that card gains an additional +2000 power during this turn.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:power-continuation-target",
            effect: {
              type: "selectTargets",
              request: {
                chooser: "self",
                player: "self",
                zones: ["leaderArea", "characterArea"],
                min: 0,
                max: 1,
                filter: { categories: ["leader", "character"] },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "modifyPower",
              value: 2000,
              duration: { type: "thisBattle" },
            },
          },
          {
            connector: "then",
            effect: {
              type: "modifyPower",
              value: 2000,
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:modifyPower",
        "composition:selectThenApply",
        "target:selectedCharacter",
        "duration:thisBattle",
        "duration:thisTurn",
      ]),
    );
  });
});
