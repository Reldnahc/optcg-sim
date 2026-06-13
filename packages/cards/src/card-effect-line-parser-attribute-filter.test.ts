import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("attribute-filtered parser support", () => {
  it.each(["<Special>", "＜Special＞"])(
    "parses %s opponent Character attributes through reusable target filters",
    (attributeText) => {
      const result = parseCardEffectLine(
        `[When Attacking] Give up to 1 of your opponent's ${attributeText} attribute Characters −5000 power during this turn.`,
      );

      expect(result).toHaveProperty("block");
      if (result === undefined || !("block" in result)) {
        throw new Error("expected parsed effect line");
      }
      expect(result.block).toMatchObject({
        effect: {
          type: "modifyPower",
          target: {
            type: "choose",
            request: {
              player: "opponent",
              zone: "characterArea",
              filter: {
                attributesAny: ["special"],
                categories: ["character"],
              },
            },
          },
          value: -5000,
          duration: { type: "thisTurn" },
        },
      });
      expect(result.evidence).toEqual(
        expect.arrayContaining([
          "instruction:modifyPower",
          "target:opponentCharacters",
          "filter:attribute",
          "filter:category:character",
          "duration:thisTurn",
        ]),
      );
    },
  );
});
