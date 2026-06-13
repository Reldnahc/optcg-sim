import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("DON Phase placement parser", () => {
  it("parses conditional DON Phase placement redirection as a permanent modifier primitive", () => {
    const result = parseCardEffectLine(
      "If you have any DON!! cards on your field, 1 DON!! card placed during your DON!! Phase is given to your Leader.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "redirectDonPhasePlacement",
          player: "self",
          count: 1,
          target: { type: "myLeader" },
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "fieldCount",
              player: "self",
              filter: { categories: ["don"] },
              op: "gte",
              value: 1,
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "expression:conditionalContinuous",
        "condition:donFieldCount",
        "instruction:redirectDonPhasePlacement",
        "phase:don",
        "target:yourLeader",
        "duration:whileConditionTrue",
      ]),
    );
  });
});
