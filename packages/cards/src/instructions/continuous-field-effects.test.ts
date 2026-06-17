import { describe, expect, it } from "vitest";

import type { ContinuousInstructionContext } from "./continuous-field-effects.js";
import {
  parseBasePowerBecomeInstruction,
  parseSelfCannotAttackInstruction,
  parseSetBasePowerInstruction,
  parseTargetedKeywordGrantInstruction,
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

  it("parses your Leader plus this Character base power with explicit duration", () => {
    expect(
      parseBasePowerBecomeInstruction(
        {
          text: "Your Leader and this Character's base power becomes 7000 during this turn.",
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
              type: "setBasePower",
              target: { type: "myLeader" },
              value: 7000,
              duration: { type: "thisTurn" },
            },
          },
          {
            connector: "always",
            effect: {
              type: "setBasePower",
              target: { type: "self" },
              value: 7000,
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
      evidence: [
        "instruction:setBasePower",
        "target:yourLeader",
        "target:thisCharacter",
        "value:basePower:positiveInteger",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });

  it("parses base power from an opponent leader power snapshot value", () => {
    expect(
      parseBasePowerBecomeInstruction(
        {
          text: "This Character's base power becomes the same as your opponent's Leader's power during this turn.",
        },
        { condition: undefined },
      ),
    ).toMatchObject({
      effect: {
        type: "setBasePower",
        target: { type: "self" },
        value: {
          type: "snapshotCardStat",
          target: { type: "opponentLeader" },
          stat: "currentPower",
        },
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:setBasePower",
        "target:thisCharacter",
        "value:basePower:snapshotCurrentPower",
        "target:opponentLeader",
        "duration:thisTurn",
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
        "duration:opponentNextEndPhase",
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

  it("parses explicit temporary durations on generic keyword grants", () => {
    expect(
      parseThisCharacterKeywordGrantInstruction(
        {
          text: "This Character gains [Blocker] until the end of your opponent's next End Phase.",
        },
        { condition: undefined },
      ),
    ).toMatchObject({
      effect: {
        type: "giveKeyword",
        target: { type: "self" },
        keyword: "blocker",
        duration: { type: "untilEndOfNextTurn", player: "opponent" },
      },
      evidence: [
        "instruction:giveKeyword",
        "target:thisCharacter",
        "keyword:anySupported",
        "duration:opponentNextEndPhase",
      ],
      rest: "",
    });
  });

  it("parses natural played-turn Character attack permission as Rush:Character", () => {
    expect(
      parseThisCharacterKeywordGrantInstruction(
        {
          text: "this Character can attack Characters on the turn in which it is played.",
        },
        context,
      ),
    ).toMatchObject({
      effect: {
        type: "giveKeyword",
        target: { type: "self" },
        keyword: "rushCharacter",
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

  it("parses filtered played-turn Character attack permission as Rush:Character", () => {
    expect(
      parseThisCharacterKeywordGrantInstruction(
        {
          text: "Your {SWORD} type Characters can attack Characters on the turn in which they are played.",
        },
        context,
      ),
    ).toMatchObject({
      effect: {
        type: "giveKeyword",
        target: {
          type: "all",
          player: "self",
          zone: "characterArea",
          filter: {
            categories: ["character"],
            typesAny: ["SWORD"],
          },
        },
        keyword: "rushCharacter",
        duration: {
          type: "whileConditionTrue",
          condition: context.condition,
        },
      },
      evidence: [
        "instruction:giveKeyword",
        "target:yourCharacters",
        "filter:type",
        "keyword:anySupported",
        "duration:whileConditionTrue",
      ],
      rest: "",
    });
  });

  it("parses selected played-turn Character attack permission as targeted rushCharacter grant", () => {
    const result = parseTargetedKeywordGrantInstruction({
      text: "Up to 1 of your {Fish-Man} or {Merfolk} type Characters can attack Characters on the turn in which it is played.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "giveKeyword",
        target: {
          type: "choose",
        },
        keyword: "rushCharacter",
        duration: { type: "thisTurn" },
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:giveKeyword",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:yourCharacters",
        "filter:category:character",
        "filter:type",
        "keyword:anySupported",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses self-next-turn duration through multiple field effect body families", () => {
    expect(
      parseYourLeaderConditionalPowerInstruction(
        {
          text: "This Character gains +2000 power until the start of your next turn.",
        },
        { condition: undefined },
      ),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: 2000,
        duration: { type: "untilStartOfNextTurn", player: "self" },
      },
      evidence: [
        "instruction:modifyPower",
        "target:thisCharacter",
        "modifier:positivePower",
        "duration:selfNextTurnStart",
      ],
      rest: "",
    });

    expect(
      parseThisCharacterKeywordGrantInstruction(
        {
          text: "This Character gains [Blocker] until the start of your next turn.",
        },
        { condition: undefined },
      ),
    ).toMatchObject({
      effect: {
        type: "giveKeyword",
        target: { type: "self" },
        keyword: "blocker",
        duration: { type: "untilStartOfNextTurn", player: "self" },
      },
      evidence: [
        "instruction:giveKeyword",
        "target:thisCharacter",
        "keyword:anySupported",
        "duration:selfNextTurnStart",
      ],
      rest: "",
    });
  });

  it.each([
    ["This Leader cannot attack.", "target:thisCard"],
    ["This Character cannot attack.", "target:thisCharacter"],
  ])("parses %s as a reusable self attack restriction", (text, target) => {
    expect(
      parseSelfCannotAttackInstruction({ text }, { condition: undefined }),
    ).toMatchObject({
      effect: {
        type: "cannotAttack",
        target: { type: "self" },
        duration: { type: "whileSourceOnField" },
      },
      evidence: [
        "instruction:preventActivation",
        target,
        "duration:whileSourceOnField",
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

  it("parses this Character keyword and cost gains as separate reusable modifiers", () => {
    expect(
      parseThisCharacterKeywordGrantInstruction(
        {
          text: "this Character gains [Blocker] and +3 cost.",
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
              target: { type: "self" },
              keyword: "blocker",
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
              player: "self",
              target: { type: "self" },
              value: 3,
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
        "instruction:modifyCost",
        "target:thisCharacter",
        "keyword:anySupported",
        "modifier:positiveCost",
        "duration:whileConditionTrue",
      ],
      rest: "",
    });
  });

  it("parses this Character keyword and dynamic cost gains through the keyword parser", () => {
    expect(
      parseThisCharacterKeywordGrantInstruction(
        {
          text: "this Character gains [Rush] and +1 cost for every 5 Events in your trash.",
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
              target: { type: "self" },
              keyword: "rush",
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
              player: "self",
              target: { type: "self" },
              value: {
                type: "countMatchingZoneCards",
                player: "self",
                zone: "trash",
                filter: { categories: ["event"] },
                per: 5,
                multiplier: 1,
              },
              duration: {
                type: "whileConditionTrue",
                condition: context.condition,
              },
            },
          },
        ],
      },
      rest: "",
    });
    expect(
      parseThisCharacterKeywordGrantInstruction(
        {
          text: "this Character gains [Rush] and +1 cost for every 5 Events in your trash.",
        },
        context,
      )?.evidence,
    ).toEqual(
      expect.arrayContaining([
        "instruction:giveKeyword",
        "instruction:modifyCost",
        "target:thisCharacter",
        "keyword:anySupported",
        "modifier:positiveCost",
        "duration:whileConditionTrue",
        "value:dynamic:matchingZoneCards",
        "zone:trash",
        "filter:category:event",
      ]),
    );
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

  it("parses own Leader and all Characters stat gain under a supplied condition", () => {
    expect(
      parseYourLeaderConditionalPowerInstruction(
        {
          text: "your Leader and all of your Characters gain +1000 power.",
        },
        {
          condition: {
            type: "fieldCount",
            player: "self",
            filter: { categories: ["character"], cost: { min: 8 } },
            op: "gte",
            value: 1,
          },
        },
      ),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "modifyPower",
              target: { type: "myLeader" },
              value: 1000,
              duration: {
                type: "whileConditionTrue",
                condition: {
                  type: "fieldCount",
                  filter: { categories: ["character"], cost: { min: 8 } },
                },
              },
            },
          },
          {
            effect: {
              type: "modifyPower",
              target: {
                type: "all",
                player: "self",
                zone: "characterArea",
                filter: { categories: ["character"] },
              },
              value: 1000,
            },
          },
        ],
      },
      evidence: [
        "instruction:modifyPower",
        "target:yourLeader",
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:category:character",
        "modifier:positivePower",
        "duration:whileConditionTrue",
      ],
      rest: "",
    });
  });

  it("parses this Character power per distinct matching field name as a dynamic value", () => {
    expect(
      parseYourLeaderConditionalPowerInstruction(
        {
          text: "This Character gains +1000 power for each of your Characters with a different card name.",
        },
        { condition: { type: "yourTurn" } },
      ),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: {
          type: "countDistinctMatchingFieldNames",
          player: "self",
          zone: "characterArea",
          filter: { categories: ["character"], custom: "differentNames" },
          multiplier: 1000,
        },
        duration: {
          type: "whileConditionTrue",
          condition: { type: "yourTurn" },
        },
      },
      evidence: [
        "instruction:modifyPower",
        "target:thisCharacter",
        "value:dynamic:distinctFieldNames",
        "filter:category:character",
        "filter:differentNames",
        "duration:whileConditionTrue",
      ],
      rest: "",
    });
  });
});
