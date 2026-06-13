import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("permanent keyword and cost parser", () => {
  it.each([
    [
      "leader name",
      "If your Leader is [Koala] or [Monkey.D.Luffy], this Character gains [Blocker] and +3 cost.",
      {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
      },
      3,
    ],
    [
      "life count",
      "If you have 3 or less Life cards, this Character gains [Blocker] and +4 cost.",
      { type: "lifeCount", player: "self", op: "lte", value: 3 },
      4,
    ],
  ])(
    "parses %s conditional keyword and cost gains as reusable continuous primitives",
    (_label, text, condition, costValue) => {
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
                  type: "giveKeyword",
                  target: { type: "self" },
                  keyword: "blocker",
                  duration: {
                    type: "whileConditionTrue",
                    condition,
                  },
                },
              },
              {
                connector: "always",
                effect: {
                  type: "modifyCost",
                  player: "self",
                  target: { type: "self" },
                  value: costValue,
                  duration: {
                    type: "whileConditionTrue",
                    condition,
                  },
                },
              },
            ],
          },
        },
      });
      expect(result?.evidence).toEqual(
        expect.arrayContaining([
          "entry:implicitPermanent",
          "expression:conditionalContinuous",
          "instruction:giveKeyword",
          "instruction:modifyCost",
          "target:thisCharacter",
          "keyword:anySupported",
          "modifier:positiveCost",
          "duration:whileConditionTrue",
        ]),
      );
    },
  );
});
