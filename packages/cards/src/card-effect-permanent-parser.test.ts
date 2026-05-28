import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("permanent card effect line parser", () => {
  it("parses Opponent's Turn named-card and self base power as reusable continuous primitives", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] All of your [Ohm] cards' base power and this Character's base power become 6000.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        condition: { type: "opponentTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "setBasePower",
                target: {
                  type: "all",
                  zone: "characterArea",
                  player: "self",
                  filter: { categories: ["character"], names: ["Ohm"] },
                },
                value: 6000,
                duration: {
                  type: "whileConditionTrue",
                  condition: { type: "opponentTurn" },
                },
              },
            },
            {
              connector: "always",
              effect: {
                type: "setBasePower",
                target: { type: "self" },
                value: 6000,
                duration: {
                  type: "whileConditionTrue",
                  condition: { type: "opponentTurn" },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:opponentTurn",
        "condition:opponentTurn",
        "instruction:setBasePower",
        "filter:name",
        "filter:category:character",
        "target:thisCharacter",
        "duration:whileConditionTrue",
      ]),
    );
  });
});
