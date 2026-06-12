import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP14 rested-state and rested-trigger parsing", () => {
  it("composes turn windows with rested-state continuous self power grants", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] If this Character is rested, this Character gains +2000 power.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: 2000,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "and",
              conditions: [
                { type: "opponentTurn" },
                {
                  type: "cardState",
                  target: { type: "self" },
                  state: "rested",
                },
              ],
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:opponentTurn",
        "condition:cardState",
        "instruction:modifyPower",
      ]),
    );
  });

  it("composes turn windows with direct self-rested reactions", () => {
    const result = parseCardEffectLine(
      "[Your Turn] When this Character becomes rested, rest up to 1 of your opponent's Characters with a cost of 4 or less.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "cardRested",
          target: "self",
          player: "self",
          filter: { categories: ["character"] },
        },
        condition: { type: "yourTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "selectTargets",
                request: {
                  player: "opponent",
                  zone: "characterArea",
                  filter: {
                    categories: ["character"],
                    cost: { max: 4 },
                  },
                },
              },
            },
            { effect: { type: "rest" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:yourTurn",
        "trigger:cardRested",
        "instruction:rest",
      ]),
    );
  });
});
