import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("permanent card effect line parser", () => {
  it("parses implicit permanent named-card and self keyword grants as reusable primitives", () => {
    const result = parseCardEffectLine(
      "All of your [Ohm] cards and this Character gain [Double Attack].",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
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
                duration: { type: "whileSourceOnField" },
              },
            },
            {
              connector: "always",
              effect: {
                type: "giveKeyword",
                target: { type: "self" },
                keyword: "doubleAttack",
                duration: { type: "whileSourceOnField" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "instruction:giveKeyword",
        "filter:name",
        "filter:category:character",
        "target:thisCharacter",
        "keyword:anySupported",
      ]),
    );
  });

  it("parses Opponent's Turn named-card and self base power as reusable continuous primitives", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] All of your [Ohm] cards' base power and this Character's base power become 6000.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        condition: { type: "opponentTurn" },
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
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:opponentTurn",
        "condition:opponentTurn",
        "instruction:setBasePower",
        "filter:name",
        "filter:category:character",
        "target:thisCharacter",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it("parses Opponent's Turn rest protection and keyword grant as reusable continuous primitives", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] This Character cannot be rested by your opponent's Leader and Character effects and gains [Blocker].",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        condition: { type: "opponentTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "giveProtection",
                target: { type: "self" },
                protection: {
                  process: "rest",
                  sourceKind: "cardEffect",
                  sourceControllerRelation: "opponentControlled",
                  sourceCardCategories: ["leader", "character"],
                },
                duration: {
                  type: "whileConditionTrue",
                  condition: { type: "opponentTurn" },
                },
              },
            },
            {
              connector: "always",
              effect: {
                type: "giveKeyword",
                target: { type: "self" },
                keyword: "blocker",
                duration: {
                  type: "whileConditionTrue",
                  condition: { type: "opponentTurn" },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:opponentTurn",
        "condition:opponentTurn",
        "instruction:giveProtection",
        "protectionProcess:rest",
        "protectionSource:opponentCardCategoryEffects",
        "sourceCategory:leader",
        "sourceCategory:character",
        "instruction:giveKeyword",
        "keyword:anySupported",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it("parses relative DON-count self hand cost reduction as reusable primitives", () => {
    const result = parseCardEffectLine(
      "If the number of DON!! cards on your field is at least 2 less than the number on your opponent's field, give this card in your hand −3 cost.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyCost",
          player: "self",
          sourceZone: "hand",
          target: { type: "self" },
          value: -3,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "fieldCountDifference",
              minuend: {
                player: "opponent",
                filter: { categories: ["don"] },
              },
              subtrahend: {
                player: "self",
                filter: { categories: ["don"] },
              },
              op: "gte",
              value: 2,
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "condition:fieldCountDifference",
        "player:opponent",
        "player:self",
        "instruction:modifyCost",
        "target:thisCard",
        "zone:hand",
        "modifier:costReduction",
      ]),
    );
  });

  it("parses filtered trash-count self power and cost gains as reusable primitives", () => {
    const result = parseCardEffectLine(
      "If you have 4 or more Events in your trash, this Character gains +2000 power and +5 cost.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
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
                  condition: {
                    type: "trashCount",
                    player: "self",
                    filter: { categories: ["event"] },
                    op: "gte",
                    value: 4,
                  },
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
                  condition: {
                    type: "trashCount",
                    player: "self",
                    filter: { categories: ["event"] },
                    op: "gte",
                    value: 4,
                  },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "condition:trashCount",
        "filter:category:event",
        "instruction:modifyPower",
        "instruction:modifyCost",
        "target:thisCharacter",
        "modifier:positivePower",
        "modifier:positiveCost",
      ]),
    );
  });
});
