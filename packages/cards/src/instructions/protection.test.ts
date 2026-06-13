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
        "protectionProcess:rest",
        "protectionSource:opponentCardCategoryEffects",
        "protectionSource:opponentCardFilterEffects",
        "protectionSource:cardFilterEffects",
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
            classification: "moveFromFieldToOtherZone",
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

  it("parses effect K.O. protection without falling back to planned custom support", () => {
    expect(
      parseProtectionInstruction(
        {
          text: "This Character cannot be K.O.'d by effects.",
        },
        context,
      ),
    ).toMatchObject({
      effect: {
        type: "protectFromKO",
        target: { type: "self" },
        duration: {
          type: "whileConditionTrue",
          condition: context.condition,
        },
      },
      evidence: [
        "instruction:giveProtection",
        "target:thisCharacter",
        "protectionProcess:ko",
        "protectionSource:effects",
        "duration:whileConditionTrue",
      ],
      rest: "",
    });
  });

  it("parses K.O. protection with a reusable source card filter", () => {
    expect(
      parseProtectionInstruction(
        {
          text: "This Character cannot be K.O.'d by effects of your opponent's Characters with 5000 base power or less.",
        },
        { condition: undefined },
      ),
    ).toMatchObject({
      effect: {
        type: "protectFromKO",
        target: { type: "self" },
        sourceKind: "cardEffect",
        sourceControllerRelation: "opponentControlled",
        sourceCardFilter: {
          categories: ["character"],
          power: { max: 5000 },
        },
        duration: { type: "whileSourceOnField" },
      },
      rest: "",
    });
    expect(
      parseProtectionInstruction(
        {
          text: "This Character cannot be K.O.'d by effects of your opponent's Characters with 5000 base power or less.",
        },
        { condition: undefined },
      )?.evidence,
    ).toEqual(
      expect.arrayContaining([
        "instruction:giveProtection",
        "target:thisCharacter",
        "protectionProcess:ko",
        "protectionSource:opponentCardFilterEffects",
        "player:opponent",
        "filter:category:character",
        "filter:power",
        "duration:whileSourceOnField",
      ]),
    );
  });

  it("parses K.O. protection from filtered effects without coupling source controller", () => {
    expect(
      parseProtectionInstruction(
        {
          text: "This Character cannot be K.O.'d by effects of Characters without the <Special> attribute.",
        },
        { condition: undefined },
      ),
    ).toMatchObject({
      effect: {
        type: "protectFromKO",
        target: { type: "self" },
        sourceKind: "cardEffect",
        sourceControllerRelation: "eitherController",
        sourceCardFilter: {
          categories: ["character"],
          attributesNotAny: ["special"],
        },
        duration: { type: "whileSourceOnField" },
      },
      rest: "",
    });
    expect(
      parseProtectionInstruction(
        {
          text: "This Character cannot be K.O.'d by effects of Characters without the <Special> attribute.",
        },
        { condition: undefined },
      )?.evidence,
    ).toEqual(
      expect.arrayContaining([
        "instruction:giveProtection",
        "target:thisCharacter",
        "protectionProcess:ko",
        "protectionSource:cardFilterEffects",
        "filter:category:character",
        "filter:attribute",
        "filter:negated",
        "duration:whileSourceOnField",
      ]),
    );
  });

  it("composes shared source protection across K.O. and rest processes", () => {
    expect(
      parseProtectionInstruction(
        {
          text: "This Character cannot be K.O.'d or rested by your opponent's effects.",
        },
        { condition: undefined },
      ),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "protectFromKO",
              target: { type: "self" },
              sourceKind: "cardEffect",
              sourceControllerRelation: "opponentControlled",
              duration: { type: "whileSourceOnField" },
            },
          },
          {
            connector: "then",
            effect: {
              type: "giveProtection",
              target: { type: "self" },
              protection: {
                process: "rest",
                sourceKind: "cardEffect",
                sourceControllerRelation: "opponentControlled",
              },
              duration: { type: "whileSourceOnField" },
            },
          },
        ],
      },
      rest: "",
    });
    expect(
      parseProtectionInstruction(
        {
          text: "This Character cannot be K.O.'d or rested by your opponent's effects.",
        },
        { condition: undefined },
      )?.evidence,
    ).toEqual(
      expect.arrayContaining([
        "instruction:giveProtection",
        "target:thisCharacter",
        "protectionProcess:ko",
        "protectionProcess:rest",
        "protectionSource:opponentEffects",
        "duration:whileSourceOnField",
      ]),
    );
  });

  it("parses all-target field-removal protection by self effects", () => {
    expect(
      parseProtectionInstruction(
        {
          text: "All of your opponent's Characters cannot be removed from the field by your effects.",
        },
        { condition: undefined },
      ),
    ).toMatchObject({
      effect: {
        type: "giveProtection",
        target: {
          type: "all",
          player: "opponent",
          zone: "characterArea",
          filter: { categories: ["character"] },
        },
        protection: {
          process: "fieldRemoval",
          fieldRemoval: {
            classification: "moveFromFieldToOtherZone",
            sourceKind: "cardEffect",
            sourceControllerRelation: "selfControlled",
          },
        },
        duration: { type: "whileSourceOnField" },
      },
      rest: "",
    });
    expect(
      parseProtectionInstruction(
        {
          text: "All of your opponent's Characters cannot be removed from the field by your effects.",
        },
        { condition: undefined },
      )?.evidence,
    ).toEqual(
      expect.arrayContaining([
        "instruction:giveProtection",
        "cardinality:all",
        "player:opponent",
        "filter:category:character",
        "protectionProcess:fieldRemoval",
        "protectionSource:selfEffects",
        "duration:whileSourceOnField",
      ]),
    );
  });
});
