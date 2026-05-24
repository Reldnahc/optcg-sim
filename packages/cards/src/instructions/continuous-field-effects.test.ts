import { describe, expect, it } from "vitest";

import type { ContinuousInstructionContext } from "./continuous-field-effects.js";
import {
  parseThisCharacterKeywordGrantInstruction,
  thisCharacterKeywordGrantPrimitive,
} from "./continuous-field-effects.js";

const context: ContinuousInstructionContext = {
  condition: {
    type: "trashCount",
    player: "self",
    op: "gte",
    value: 7,
  },
};

describe("continuous field-effect instruction parsers", () => {
  it("defines continuous bodies as primitive parents with match families", () => {
    expect(thisCharacterKeywordGrantPrimitive).toEqual({
      primitiveId: "instruction:giveKeyword",
      childPrimitiveIds: [
        "target:thisCharacter",
        "keyword:anySupported",
        "duration:whileConditionTrue",
      ],
    });
  });

  it.each([
    ["gains [Blocker]", "blocker"],
    ["[Blocker]", "blocker"],
    ["[Banish]", "banish"],
    ["[Rush]", "rush"],
    ["[Rush:Character]", "rushCharacter"],
    ["[Double Attack]", "doubleAttack"],
  ])("parses %s as a generic supported keyword grant", (printed, keyword) => {
    expect(
      parseThisCharacterKeywordGrantInstruction(
        {
          text: printed.startsWith("gains")
            ? printed
            : `this Character gains ${printed}`,
        },
        context,
      ),
    ).toMatchObject({
      effect: {
        type: "giveKeyword",
        target: { type: "self" },
        keyword,
        duration: { type: "permanent" },
      },
      evidence: [
        "instruction:giveKeyword",
        "target:thisCharacter",
        "keyword:anySupported",
        "duration:whileConditionTrue",
      ],
      rest: "",
    });
  });
});
