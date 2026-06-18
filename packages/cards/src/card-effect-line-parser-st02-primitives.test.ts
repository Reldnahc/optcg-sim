import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses attached-DON field-count self card power gain", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] If you have 3 or more Characters, this card gains +2000 power.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: 1,
      },
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: 2000,
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "and",
            conditions: [
              {
                type: "attachedDonCount",
                target: { type: "self" },
                op: "gte",
                value: 1,
              },
              {
                type: "fieldCount",
                player: "self",
                filter: { categories: ["character"] },
                op: "gte",
                value: 3,
              },
            ],
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "marker:attachedDon",
      "condition:attachedDonCount",
      "expression:conditionalContinuous",
      "composition:conditionAnd",
      "condition:fieldCount",
      "filter:category:character",
      "instruction:modifyPower",
      "target:thisCard",
      "modifier:positivePower",
      "duration:whileConditionTrue",
    ]),
  );
});

it("parses attached-DON battle trigger self card activation", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] [Once Per Turn] [Your Turn] If this Character battles your opponent's Character, set this card as active.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      oncePerTurn: true,
      condition: { type: "and" },
      trigger: {
        type: "attackDeclared",
        role: "attacker",
        player: "self",
        filter: { categories: ["character"] },
        targetPlayer: "opponent",
        targetFilter: { categories: ["character"] },
      },
      effect: {
        type: "activate",
        target: { type: "self" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "marker:attachedDon",
      "marker:oncePerTurn",
      "entry:yourTurn",
      "trigger:attackDeclared",
      "target:thisCharacter",
      "target:opponentCharacter",
      "instruction:activate",
      "target:thisCard",
      "state:active",
    ]),
  );
});
