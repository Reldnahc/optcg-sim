import { describe, expect, it } from "vitest";

import { parseAndConnector } from "../connectors/index.js";
import { parseTrashCountCondition } from "../conditions/index.js";
import {
  parseOpponentEffectFieldRemovalProtectionInstruction,
  parseThisCharacterKeywordGrantInstruction,
} from "../instructions/index.js";
import { conditionalContinuousExpressionParser } from "./conditional-continuous.js";

const parser = conditionalContinuousExpressionParser({
  conditions: [parseTrashCountCondition],
  connectors: [parseAndConnector],
  instructions: [
    parseOpponentEffectFieldRemovalProtectionInstruction,
    parseThisCharacterKeywordGrantInstruction,
  ],
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
        condition: {
          type: "trashCount",
          player: "self",
          op: "gte",
          value: 7,
        },
      },
      effect: {
        type: "giveProtection",
        target: { type: "self" },
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
});
