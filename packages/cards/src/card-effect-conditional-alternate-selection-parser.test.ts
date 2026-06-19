import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("conditional alternate selection parser", () => {
  it("parses conditional alternate K.O. target selection as reusable conditional choice", () => {
    const result = parseCardEffectLine(
      "[Main] K.O. up to 1 of your opponent's Characters with a cost of 4 or less. If you have a Character with a cost of 8 or more, you may select your opponent's Character with a cost of 6 or less instead.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
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
          },
          else: {
            type: "sequence",
          },
        },
      },
    });
    if (result === undefined || !("block" in result)) {
      throw new Error("Expected parsed effect line.");
    }
    const effect = result.block.effect;
    if (effect.type !== "conditional" || effect.then.type !== "choice") {
      throw new Error("Expected conditional choice effect.");
    }
    expect(effect.then.options).toHaveLength(2);
    expect(effect.then.options.map((option) => option.effect.type)).toEqual([
      "sequence",
      "sequence",
    ]);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "expression:conditional",
        "condition:fieldCount",
        "instruction:ko",
        "composition:chooseOne",
        "composition:selectThenApply",
      ]),
    );
  });

  it("parses choose-and-KO conditional alternate target selection through the same conditional choice", () => {
    const result = parseCardEffectLine(
      "[Main] Choose up to 1 of your opponent's Characters with a cost of 4 or less and K.O. it. If you have 15 or more cards in your trash, choose up to 1 of your opponent's Characters with a cost of 6 or less instead of a Character with a cost of 4 or less.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
        effect: {
          type: "conditional",
          if: {
            type: "trashCount",
            player: "self",
            op: "gte",
            value: 15,
          },
          then: {
            type: "choice",
            chooser: "self",
            min: 1,
            max: 1,
          },
          else: {
            type: "sequence",
          },
        },
      },
    });
    if (result === undefined || !("block" in result)) {
      throw new Error("Expected parsed effect line.");
    }
    const effect = result.block.effect;
    if (effect.type !== "conditional" || effect.then.type !== "choice") {
      throw new Error("Expected conditional choice effect.");
    }
    expect(effect.then.options).toHaveLength(2);
    expect(effect.then.options.map((option) => option.effect.type)).toEqual([
      "sequence",
      "sequence",
    ]);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "expression:conditional",
        "condition:trashCount",
        "instruction:ko",
        "composition:chooseOne",
        "composition:selectThenApply",
      ]),
    );
  });
});
