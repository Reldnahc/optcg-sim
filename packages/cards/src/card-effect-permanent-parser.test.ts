import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("permanent card effect line parser", () => {
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
});
