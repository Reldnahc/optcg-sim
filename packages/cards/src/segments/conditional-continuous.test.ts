import { describe, expect, it } from "vitest";

import { parseAndConnector } from "../connectors/index.js";
import {
  parseFieldCardCountCondition,
  parseSelfFieldCountCondition,
  parseTrashCountCondition,
} from "../conditions/index.js";
import {
  parseOpponentEffectFieldRemovalProtectionInstruction,
  parseThisCharacterKeywordGrantInstruction,
  parseYourLeaderConditionalPowerInstruction,
} from "../instructions/index.js";
import { conditionalContinuousExpressionParser } from "./conditional-continuous.js";

const parser = conditionalContinuousExpressionParser({
  conditions: [parseTrashCountCondition, parseFieldCardCountCondition],
  connectors: [parseAndConnector],
  instructions: [
    parseOpponentEffectFieldRemovalProtectionInstruction,
    parseThisCharacterKeywordGrantInstruction,
  ],
});

const allFieldStatGainParser = conditionalContinuousExpressionParser({
  conditions: [parseSelfFieldCountCondition],
  connectors: [parseAndConnector],
  instructions: [parseYourLeaderConditionalPowerInstruction],
});

describe("conditional continuous expression parser", () => {
  it("parses condition plus one continuous body primitive", () => {
    expect(
      parser({
        text: "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects.",
      }),
    ).toMatchObject({
      blockPatch: {
        category: "permanent",
      },
      effect: {
        type: "giveProtection",
        target: { type: "self" },
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "trashCount",
            player: "self",
            op: "gte",
            value: 7,
          },
        },
      },
    });
  });

  it("parses protection plus any supported keyword in either order", () => {
    const protectionThenKeyword = parser({
      text: "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Blocker].",
    });
    const keywordThenProtection = parser({
      text: "If you have 7 or more cards in your trash, this Character gains [Double Attack] and cannot be removed from the field by your opponent's effects.",
    });

    expect(protectionThenKeyword).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "giveProtection" },
          },
          {
            connector: "always",
            effect: { type: "giveKeyword", keyword: "blocker" },
          },
        ],
      },
    });
    expect(keywordThenProtection).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "giveKeyword", keyword: "doubleAttack" },
          },
          {
            connector: "always",
            effect: { type: "giveProtection" },
          },
        ],
      },
    });
  });

  it("does not force explicit action continuous bodies into permanent category", () => {
    const result = parser({
      text: "If your opponent has a Character with 8000 power or more, this Character gains [Rush: Character] during this turn.",
      entryPoint: {
        type: "entryPoint",
        category: "activate",
        trigger: { type: "activateMain" },
      },
    });

    expect(result).toMatchObject({
      blockPatch: {},
      effect: {
        type: "giveKeyword",
        keyword: "rushCharacter",
        duration: { type: "thisTurn" },
      },
    });
  });

  it("keeps default-auto action entries conditional instead of treating them as permanent", () => {
    const result = parser({
      text: "If your opponent has a Character with 8000 power or more, this Character gains [Rush: Character] during this turn.",
      entryPoint: {
        type: "entryPoint",
        trigger: { type: "main" },
      },
    });

    expect(result).toMatchObject({
      blockPatch: {
        condition: {
          type: "fieldCount",
          player: "opponent",
          op: "gte",
          value: 1,
          filter: {
            categories: ["character"],
          },
        },
      },
      effect: {
        type: "giveKeyword",
        keyword: "rushCharacter",
        duration: { type: "thisTurn" },
      },
    });
  });

  it("combines entry conditions with conditional all-field stat gains", () => {
    const result = allFieldStatGainParser({
      text: "If you have a Character with a cost of 8 or more, your Leader and all of your Characters gain +1000 power.",
      entryPoint: {
        type: "entryPoint",
        category: "permanent",
        trigger: { type: "permanent" },
        condition: {
          type: "attachedDonCount",
          target: { type: "self" },
          op: "gte",
          value: 1,
        },
      },
    });

    expect(result).toMatchObject({
      blockPatch: { category: "permanent" },
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
                  type: "and",
                  conditions: [
                    { type: "attachedDonCount", value: 1 },
                    {
                      type: "fieldCount",
                      filter: { categories: ["character"], cost: { min: 8 } },
                    },
                  ],
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
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "expression:conditionalContinuous",
        "composition:conditionAnd",
        "condition:fieldCount",
        "instruction:modifyPower",
        "duration:whileConditionTrue",
      ]),
    );
  });
});
