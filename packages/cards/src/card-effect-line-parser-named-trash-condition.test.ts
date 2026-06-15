import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser named trash conditions", () => {
  it("parses named trash presence as a reusable continuous power condition", () => {
    const result = parseCardEffectLine(
      "[Your Turn] If you have [Kuromarimo] and [Chess] in your trash, this Character gains +2000 power.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        condition: { type: "yourTurn" },
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: 2000,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "and",
              conditions: [
                {
                  type: "yourTurn",
                },
                {
                  type: "and",
                  conditions: [
                    {
                      type: "trashCount",
                      player: "self",
                      filter: { names: ["Kuromarimo"] },
                      op: "gte",
                      value: 1,
                    },
                    {
                      type: "trashCount",
                      player: "self",
                      filter: { names: ["Chess"] },
                      op: "gte",
                      value: 1,
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:trashCount",
        "filter:name",
        "composition:conditionAnd",
        "instruction:modifyPower",
      ]),
    );
  });
});
