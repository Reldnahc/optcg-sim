import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it.each([
  "This Character gains +12 cost, and if it's your opponent's turn, this Character gains +3000 power.",
  "This Character gains +12 cost, and if it’s your opponent’s turn, this Character gains +3000 power.",
])(
  "parses inline opponent-turn conditions as reusable continuous condition modifiers",
  (text) => {
    const result = parseCardEffectLine(text);

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "modifyCost",
                target: { type: "self" },
                value: 12,
                duration: { type: "whileSourceOnField" },
              },
            },
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: { type: "self" },
                value: 3000,
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
        "condition:opponentTurn",
        "expression:conditionalContinuous",
        "instruction:modifyCost",
        "instruction:modifyPower",
        "modifier:positiveCost",
        "modifier:positivePower",
      ]),
    );
  },
);
