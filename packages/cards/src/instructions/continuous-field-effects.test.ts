import { describe, expect, it } from "vitest";

import type { ContinuousInstructionContext } from "./continuous-field-effects.js";
import {
  parseBasePowerBecomeInstruction,
  parseSetBasePowerInstruction,
  parseThisCharacterKeywordGrantInstruction,
  parseYourLeaderConditionalPowerInstruction,
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

  it("parses named cards plus this Character as separate reusable base-power targets", () => {
    expect(
      parseBasePowerBecomeInstruction(
        {
          text: "All of your [Ohm] cards' base power and this Character's base power become 6000.",
        },
        {
          condition: { type: "opponentTurn" },
        },
      ),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "setBasePower",
              target: {
                type: "all",
                zone: "characterArea",
                player: "self",
                filter: { categories: ["character"], names: ["Ohm"] },
              },
              value: 6000,
              duration: {
                type: "whileConditionTrue",
                condition: { type: "opponentTurn" },
              },
            },
          },
          {
            connector: "always",
            effect: {
              type: "setBasePower",
              target: { type: "self" },
              value: 6000,
              duration: {
                type: "whileConditionTrue",
                condition: { type: "opponentTurn" },
              },
            },
          },
        ],
      },
      evidence: [
        "instruction:setBasePower",
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:name",
        "filter:category:character",
        "target:thisCharacter",
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

  it("parses named cards plus this Character as separate reusable keyword targets", () => {
    expect(
      parseThisCharacterKeywordGrantInstruction(
        {
          text: "All of your [Ohm] cards and this Character gain [Double Attack].",
        },
        context,
      ),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "giveKeyword",
              target: {
                type: "all",
                zone: "characterArea",
                player: "self",
                filter: { categories: ["character"], names: ["Ohm"] },
              },
              keyword: "doubleAttack",
              duration: {
                type: "whileConditionTrue",
                condition: context.condition,
              },
            },
          },
          {
            connector: "always",
            effect: {
              type: "giveKeyword",
              target: { type: "self" },
              keyword: "doubleAttack",
              duration: {
                type: "whileConditionTrue",
                condition: context.condition,
              },
            },
          },
        ],
      },
      evidence: [
        "instruction:giveKeyword",
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:name",
        "filter:category:character",
        "target:thisCharacter",
        "keyword:anySupported",
        "duration:whileConditionTrue",
      ],
      rest: "",
    });
  });

  it("parses this Character power and cost gains as separate reusable modifiers", () => {
    expect(
      parseYourLeaderConditionalPowerInstruction(
        {
          text: "this Character gains +2000 power and +5 cost.",
        },
        context,
      ),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "modifyPower",
              target: { type: "self" },
              value: 2000,
              duration: {
                type: "whileConditionTrue",
                condition: context.condition,
              },
            },
          },
          {
            connector: "always",
            effect: {
              type: "modifyCost",
              target: { type: "self" },
              value: 5,
              duration: {
                type: "whileConditionTrue",
                condition: context.condition,
              },
            },
          },
        ],
      },
      evidence: [
        "instruction:modifyPower",
        "instruction:modifyCost",
        "target:thisCharacter",
        "modifier:positivePower",
        "modifier:positiveCost",
        "duration:whileConditionTrue",
      ],
      rest: "",
    });
  });

  it("parses implicit this Character power gain inside composed continuous text", () => {
    expect(
      parseYourLeaderConditionalPowerInstruction(
        {
          text: "gains +2000 power.",
        },
        context,
      ),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: 2000,
        duration: {
          type: "whileConditionTrue",
          condition: context.condition,
        },
      },
      evidence: [
        "instruction:modifyPower",
        "target:thisCharacter",
        "modifier:positivePower",
        "duration:whileConditionTrue",
      ],
      rest: "",
    });
  });
});
