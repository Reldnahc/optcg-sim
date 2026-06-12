import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP14 field-presence condition parsing", () => {
  it("composes any-player field presence with counter power modification", () => {
    const result = parseCardEffectLine(
      "[Counter] If there is a Character with 8000 power or more, up to 1 of your Leader or Character cards gains +4000 power during this battle.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
        condition: {
          type: "or",
          conditions: [
            {
              type: "fieldCount",
              player: "self",
              filter: {
                categories: ["character"],
                currentPower: { min: 8000 },
              },
            },
            {
              type: "fieldCount",
              player: "opponent",
              filter: {
                categories: ["character"],
                currentPower: { min: 8000 },
              },
            },
          ],
        },
        effect: {
          type: "modifyPower",
          value: 4000,
          duration: { type: "thisBattle" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventCounter",
        "composition:conditionOr",
        "condition:fieldCount",
        "condition:opponentFieldCount",
        "instruction:modifyPower",
      ]),
    );
  });

  it("composes cost-disjunction field presence with reusable draw and trash bodies", () => {
    const result = parseCardEffectLine(
      "[On Play] If there is a Character with a cost of 0 or with a cost of 8 or more, draw 2 cards and trash 1 card from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        condition: {
          type: "or",
          conditions: [
            {
              type: "fieldCount",
              player: "self",
              filter: {
                categories: ["character"],
                cost: { op: "eq", value: 0 },
              },
              op: "gte",
              value: 1,
            },
            {
              type: "fieldCount",
              player: "opponent",
              filter: {
                categories: ["character"],
                cost: { op: "eq", value: 0 },
              },
              op: "gte",
              value: 1,
            },
            {
              type: "fieldCount",
              player: "self",
              filter: {
                categories: ["character"],
                cost: { min: 8 },
              },
              op: "gte",
              value: 1,
            },
            {
              type: "fieldCount",
              player: "opponent",
              filter: {
                categories: ["character"],
                cost: { min: 8 },
              },
              op: "gte",
              value: 1,
            },
          ],
        },
        effect: { type: "sequence" },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "composition:conditionOr",
        "filter:cost",
        "instruction:draw",
        "instruction:trashFromHand",
      ]),
    );
  });
});
