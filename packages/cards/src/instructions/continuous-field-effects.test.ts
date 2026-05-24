import { describe, expect, it } from "vitest";

import type { ContinuousInstructionContext } from "./continuous-field-effects.js";
import {
  opponentEffectFieldRemovalProtectionPrimitive,
  parseOpponentEffectFieldRemovalProtectionInstruction,
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
    expect(opponentEffectFieldRemovalProtectionPrimitive).toMatchObject({
      primitiveId: "instruction:giveProtection",
      matches: [
        {
          id: "this-character-cannot-be-removed-from-field-by-opponent-effects",
        },
      ],
    });
    expect(thisCharacterKeywordGrantPrimitive).toMatchObject({
      primitiveId: "instruction:giveKeyword",
      matches: [
        {
          id: "this-character-gains-supported-keyword",
        },
      ],
    });
  });

  it("parses opponent effect field-removal protection with while-condition duration", () => {
    expect(
      parseOpponentEffectFieldRemovalProtectionInstruction(
        {
          text: "this Character cannot be removed from the field by your opponent's effects",
        },
        context,
      ),
    ).toMatchObject({
      effect: {
        type: "giveProtection",
        target: { type: "self" },
        duration: {
          type: "whileConditionTrue",
          condition: context.condition,
        },
      },
      evidence: [
        "instruction:giveProtection",
        "protection:opponentEffectFieldRemoval",
        "target:thisCharacter",
        "duration:whileConditionTrue",
      ],
      rest: "",
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
        "keyword:anySupported",
        "target:thisCharacter",
        "duration:whileConditionTrue",
      ],
      rest: "",
    });
  });

  it("parses omitted subject protection after an ordered connector", () => {
    expect(
      parseOpponentEffectFieldRemovalProtectionInstruction(
        {
          text: "cannot be removed from the field by your opponent's effects.",
        },
        context,
      ),
    ).toMatchObject({
      effect: {
        type: "giveProtection",
        target: { type: "self" },
      },
    });
  });
});
