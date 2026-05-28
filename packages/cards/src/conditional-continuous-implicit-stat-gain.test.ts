import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("conditional continuous implicit stat gain parser", () => {
  it("parses protection and implicit self power gain compositionally", () => {
    const result = parseCardEffectLine(
      "If you have 6 or less DON!! cards on your field, this Character cannot be removed from the field by your opponent's effects and gains +2000 power.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "giveProtection", target: { type: "self" } },
            },
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: { type: "self" },
                value: 2000,
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:donFieldCount",
        "condition:comparator:lte",
        "instruction:giveProtection",
        "instruction:modifyPower",
        "target:thisCharacter",
        "modifier:positivePower",
        "duration:whileConditionTrue",
      ]),
    );
  });
});
