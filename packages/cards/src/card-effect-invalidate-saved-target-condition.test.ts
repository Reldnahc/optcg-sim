import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("invalidate-effects saved target continuation parser", () => {
  it("parses conditional K.O. of the invalidated Character under a leader condition", () => {
    const result = parseCardEffectLine(
      "[Main] If your Leader has the {Blackbeard Pirates} type, negate the effect of up to 1 of your opponent's Characters during this turn. Then, if that Character has a cost of 4 or less, K.O. it.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: { typesAny: ["Blackbeard Pirates"] },
        },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "selectTargets",
                request: {
                  player: "opponent",
                  zone: "characterArea",
                  min: 0,
                  max: 1,
                  filter: { categories: ["character"] },
                },
              },
            },
            { effect: { type: "invalidateEffects" } },
            {
              effect: {
                type: "conditional",
                if: {
                  type: "cardStatComparison",
                  stat: "cost",
                  op: "lte",
                  value: 4,
                },
                then: { type: "ko" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:leaderIdentity",
        "instruction:invalidateEffects",
        "condition:cardStatComparison",
        "condition:stat:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "composition:savedTargetCondition",
        "instruction:ko",
      ]),
    );
  });

  it("parses the same invalidated-target conditional without a leader condition", () => {
    const result = parseCardEffectLine(
      "[Main] Negate the effect of up to 1 of your opponent's Characters during this turn. Then, if that Character has a cost of 4 or less, K.O. it.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "selectTargets" } },
            { effect: { type: "invalidateEffects" } },
            {
              effect: {
                type: "conditional",
                if: { type: "cardStatComparison", op: "lte", value: 4 },
                then: { type: "ko" },
              },
            },
          ],
        },
      },
    });
  });
});
