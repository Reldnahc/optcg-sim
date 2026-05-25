import { describe, expect, it } from "vitest";

import type { ContinuousInstructionContext } from "./continuous-field-effects.js";
import {
  parseSetBasePowerInstruction,
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
  it("parses set-base-power as target plus value under a supplied condition", () => {
    expect(
      parseSetBasePowerInstruction(
        {
          text: "set the base power of all of your {Five Elders} type Characters to 7000.",
        },
        {
          condition: {
            type: "trashCount",
            player: "self",
            op: "gte",
            value: 10,
          },
        },
      ),
    ).toMatchObject({
      effect: {
        type: "setBasePower",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: {
            categories: ["character"],
            typesAny: ["Five Elders"],
          },
        },
        value: 7000,
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "trashCount",
            player: "self",
            op: "gte",
            value: 10,
          },
        },
      },
      evidence: [
        "instruction:setBasePower",
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:type",
        "filter:category:character",
        "value:basePower:positiveInteger",
        "duration:whileConditionTrue",
      ],
      rest: "",
    });
  });

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
        duration: {
          type: "whileConditionTrue",
          condition: context.condition,
        },
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
