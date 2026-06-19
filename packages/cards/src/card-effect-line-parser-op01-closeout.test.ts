import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP01 closeout parser support", () => {
  it("parses Event activation into optional conditional draw with source draw-history gating", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] When you activate an Event, you may draw 1 card if you have 4 or less cards in your hand and haven't drawn a card using this Leader's effect during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "effectQueued",
          player: "self",
          sourceFilter: { categories: ["event"] },
        },
        condition: {
          type: "attachedDonCount",
          op: "gte",
          value: 1,
        },
        effect: {
          type: "conditional",
          if: {
            type: "and",
            conditions: [
              {
                type: "handCount",
                player: "self",
                op: "lte",
                value: 4,
              },
              {
                type: "eventHistory",
                event: "cardDrawn",
                player: "self",
                window: "thisTurn",
                sourceTarget: "self",
                sourceFilter: { categories: ["leader"] },
                op: "eq",
                value: 0,
              },
            ],
          },
          then: {
            type: "sequence",
            effects: [
              {
                optional: true,
                effect: { type: "draw", count: 1, player: "self" },
              },
            ],
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "trigger:effectQueued",
        "activation:event",
        "composition:optionalActionEffect",
        "condition:handCount",
        "condition:eventHistory",
        "event:cardDrawn",
        "sourceCategory:leader",
        "condition:comparator:eq",
        "instruction:draw",
      ]),
    );
  });
});
