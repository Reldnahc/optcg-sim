import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP14 attack permission parser support", () => {
  it("parses any-player cost presence into played-turn Character attack permission", () => {
    const result = parseCardEffectLine(
      "If there is a Character with a cost of 0 or with a cost of 8 or more, this Character can attack Characters on the turn in which it is played.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "giveKeyword",
          target: { type: "self" },
          keyword: "rushCharacter",
          duration: {
            type: "whileConditionTrue",
            condition: { type: "or" },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:conditionOr",
        "condition:fieldCount",
        "condition:opponentFieldCount",
        "filter:cost",
        "instruction:giveKeyword",
        "keyword:anySupported",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it.each([
    [
      "[When Attacking]",
      "[When Attacking] Up to 1 of your {Navy} type Leader or Character cards can also attack active Characters during this turn.",
      "target:yourLeaderOrCharacters",
    ],
    [
      "[Activate: Main]",
      "[Activate: Main] You may rest this Character: Up to 1 of your {Navy} type Leader or Character cards can also attack active Characters during this turn.",
      "target:yourLeaderOrCharacters",
    ],
    [
      "[On Play]",
      "[On Play] Up to 1 of your Characters can also attack active Characters during this turn.",
      "target:yourCharacters",
    ],
  ])(
    "parses active Character attack permission as a reusable body under %s",
    (_entry, text, targetEvidence) => {
      const result = parseCardEffectLine(text);

      expect(result).toHaveProperty("block");
      if (result === undefined || !("block" in result)) {
        throw new Error("expected parsed effect line");
      }
      expect(JSON.stringify(result.block)).toContain(
        "allowAttackActiveCharacters",
      );
      expect(result.evidence).toEqual(
        expect.arrayContaining([
          "instruction:allowAttackActiveCharacters",
          targetEvidence,
          "duration:thisTurn",
        ]),
      );
    },
  );
});
