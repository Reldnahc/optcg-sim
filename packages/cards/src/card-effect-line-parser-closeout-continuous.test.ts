import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("closeout continuous parser variants", () => {
  it("parses trailing conditional continuous keyword grants", () => {
    const result = parseCardEffectLine(
      "[Your Turn] This Character gains [Double Attack] if you have 5 or more cards in your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        condition: { type: "yourTurn" },
        effect: {
          type: "giveKeyword",
          target: { type: "self" },
          keyword: "doubleAttack",
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "and",
              conditions: [
                { type: "yourTurn" },
                { type: "handCount", player: "self", op: "gte", value: 5 },
              ],
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "expression:conditionalContinuous",
        "condition:handCount",
        "instruction:giveKeyword",
        "keyword:anySupported",
        "duration:whileConditionTrue",
      ]),
    );
  });
});
