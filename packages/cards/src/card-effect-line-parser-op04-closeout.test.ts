import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP04 closeout parser support", () => {
  it("parses conditional draw with a conditional life-add alternative", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [When Attacking] If you have a total of 4 or less cards in your Life area and hand, draw 1 card. If you have a Character with a cost of 8 or more, you may add up to 1 card from the top of your deck to the top of your Life cards instead of drawing 1 card.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "whenAttacking" },
        condition: {
          type: "and",
          conditions: [
            {
              type: "attachedDonCount",
              op: "gte",
              value: 1,
            },
            {
              type: "zoneCountTotal",
              counts: [
                { player: "self", zone: "life" },
                { player: "self", zone: "hand" },
              ],
              op: "lte",
              value: 4,
            },
          ],
        },
        effect: {
          type: "conditional",
          if: {
            type: "fieldCount",
            player: "self",
            op: "gte",
            value: 1,
            filter: {
              categories: ["character"],
              cost: { min: 8 },
            },
          },
          then: {
            type: "choice",
            chooser: "self",
            min: 1,
            max: 1,
            options: [
              {
                id: "choice:default",
                effect: { type: "draw", count: 1, player: "self" },
              },
              {
                id: "choice:alternate",
                effect: {
                  type: "moveCards",
                  min: 0,
                  count: 1,
                  from: {
                    player: "self",
                    zone: "deck",
                    position: "top",
                  },
                  to: {
                    player: "self",
                    zone: "life",
                    position: "top",
                  },
                },
              },
            ],
          },
          else: { type: "draw", count: 1, player: "self" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "entry:whenAttacking",
        "expression:conditional",
        "condition:zoneCountTotal",
        "zone:life",
        "zone:hand",
        "condition:fieldCount",
        "composition:chooseOne",
        "instruction:draw",
        "instruction:moveCards",
        "destination:life",
      ]),
    );
  });
});
