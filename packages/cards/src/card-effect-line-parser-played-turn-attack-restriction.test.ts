import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("played-turn attack restriction parser", () => {
  it("parses played-turn Leader attack restriction as reusable primitives", () => {
    const result = parseCardEffectLine(
      "This Character cannot attack a Leader on the turn in which it is played.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "cannotAttackTarget",
          target: { type: "self" },
          attackTarget: {
            player: "opponent",
            zone: "leaderArea",
            filter: { categories: ["leader"] },
          },
          duration: {
            type: "whileConditionTrue",
            condition: { type: "sourcePlayedThisTurn" },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "instruction:cannotAttackTarget",
        "target:thisCharacter",
        "player:opponent",
        "zone:leaderArea",
        "filter:category:leader",
        "condition:sourcePlayedThisTurn",
        "duration:whileConditionTrue",
      ]),
    );
  });
});
