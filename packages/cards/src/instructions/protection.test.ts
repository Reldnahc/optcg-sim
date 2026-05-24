import { describe, expect, it } from "vitest";

import type { ContinuousInstructionContext } from "./continuous-field-effects.js";
import {
  parseProtectionInstruction,
  protectionInstructionPrimitive,
} from "./protection.js";

const context: ContinuousInstructionContext = {
  condition: {
    type: "trashCount",
    player: "self",
    op: "gte",
    value: 7,
  },
};

describe("continuous protection instruction parser", () => {
  it("defines protection as an instruction parent that composes child primitives", () => {
    expect(protectionInstructionPrimitive).toEqual({
      primitiveId: "instruction:giveProtection",
      childPrimitiveIds: [
        "target:thisCharacter",
        "protectionProcess:fieldRemoval",
        "protectionProcess:ko",
        "protectionSource:opponentEffects",
        "protectionSource:effects",
        "protectionSource:battle",
      ],
    });
  });

  it("composes target, field-removal process, and opponent-effects source", () => {
    expect(
      parseProtectionInstruction(
        {
          text: "this Character cannot be removed from the field by your opponent's effects",
        },
        context,
      ),
    ).toMatchObject({
      effect: {
        type: "giveProtection",
        target: { type: "self" },
        protection: {
          process: "fieldRemoval",
          fieldRemoval: {
            sourceKind: "cardEffect",
            sourceControllerRelation: "opponentControlled",
          },
        },
        duration: {
          type: "whileConditionTrue",
          condition: context.condition,
        },
      },
      evidence: [
        "instruction:giveProtection",
        "target:thisCharacter",
        "protectionProcess:fieldRemoval",
        "protectionSource:opponentEffects",
        "duration:whileConditionTrue",
      ],
      rest: "",
    });
  });

  it("keeps omitted-subject connector text on the same target primitive", () => {
    expect(
      parseProtectionInstruction(
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
      evidence: [
        "instruction:giveProtection",
        "target:thisCharacter",
        "protectionProcess:fieldRemoval",
        "protectionSource:opponentEffects",
        "duration:whileConditionTrue",
      ],
    });
  });
});
