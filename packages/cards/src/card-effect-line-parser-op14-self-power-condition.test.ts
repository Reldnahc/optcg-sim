import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP14 self current-power condition parsing", () => {
  it("composes a self current-power condition with attack-triggered target power modification", () => {
    const result = parseCardEffectLine(
      "[When Attacking] If this Character has 5000 power or more, give up to 1 of your opponent's Characters -2000 power during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "whenAttacking" },
        condition: {
          type: "cardStatComparison",
          target: { type: "self" },
          stat: "currentPower",
          op: "gte",
          value: 5000,
        },
        effect: {
          type: "modifyPower",
          target: {
            type: "choose",
            request: {
              player: "opponent",
              zone: "characterArea",
              max: 1,
            },
          },
          value: -2000,
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:whenAttacking",
        "condition:cardStatComparison",
        "condition:stat:currentPower",
        "target:thisCharacter",
        "instruction:modifyPower",
      ]),
    );
  });

  it("composes a self current-power condition with implicit continuous keyword grants", () => {
    const result = parseCardEffectLine(
      "If this Character has 5000 power or more, this Character gains [Rush].",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        effect: {
          type: "giveKeyword",
          target: { type: "self" },
          keyword: "rush",
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "cardStatComparison",
              target: { type: "self" },
              stat: "currentPower",
              op: "gte",
              value: 5000,
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "expression:conditionalContinuous",
        "condition:cardStatComparison",
        "condition:stat:currentPower",
        "target:thisCharacter",
        "instruction:giveKeyword",
      ]),
    );
  });
});
