import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses cannot attack unless opponent has enough matching Characters", () => {
  const result = parseCardEffectLine(
    "This Character cannot attack unless your opponent has 2 or more Characters with a base power of 5000 or more.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "cannotAttack",
        target: { type: "self" },
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "not",
            condition: {
              type: "fieldCount",
              player: "opponent",
              filter: { categories: ["character"], power: { min: 5000 } },
              op: "gte",
              value: 2,
            },
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "instruction:preventActivation",
      "target:thisCharacter",
      "condition:opponentFieldCount",
      "condition:comparator:gte",
      "filter:power",
      "duration:whileConditionTrue",
      "composition:conditionNot",
    ]),
  );
});

it("parses cannot attack unless either player has a matching Character", () => {
  const result = parseCardEffectLine(
    "This Character cannot attack unless there is a Character with 12000 base power or more.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "cannotAttack",
        target: { type: "self" },
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "not",
            condition: {
              type: "or",
              conditions: [
                {
                  type: "fieldCount",
                  player: "self",
                  filter: { categories: ["character"], power: { min: 12000 } },
                  op: "gte",
                  value: 1,
                },
                {
                  type: "fieldCount",
                  player: "opponent",
                  filter: { categories: ["character"], power: { min: 12000 } },
                  op: "gte",
                  value: 1,
                },
              ],
            },
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:implicitPermanent",
      "instruction:preventActivation",
      "target:thisCharacter",
      "condition:fieldCount",
      "condition:opponentFieldCount",
      "composition:conditionOr",
      "composition:conditionNot",
      "filter:power",
      "duration:whileConditionTrue",
    ]),
  );
});
