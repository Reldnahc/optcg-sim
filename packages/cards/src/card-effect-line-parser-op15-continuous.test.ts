import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses named current-power field condition with no-other condition for continuous self power", () => {
  const result = parseCardEffectLine(
    "If you have [Gecko Moria] with 10000 power or more on your field and there are no other [Oars] cards, this Character gains +7000 power.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: 7000,
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "and",
            conditions: [
              {
                type: "fieldCount",
                player: "self",
                op: "gte",
                value: 1,
                filter: {
                  categories: ["character"],
                  names: ["Gecko Moria"],
                  currentPower: { min: 10000 },
                },
              },
              {
                type: "fieldCount",
                player: "self",
                op: "eq",
                value: 0,
                filter: {
                  names: ["Oars"],
                  excludeSelf: true,
                },
              },
            ],
          },
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "expression:conditionalContinuous",
      "composition:conditionAnd",
      "condition:fieldCount",
      "filter:name",
      "filter:currentPower",
      "filter:excludeSelf",
      "instruction:modifyPower",
      "duration:whileConditionTrue",
    ]),
  );
});

it("reuses named current-power field condition without no-other coupling", () => {
  const result = parseCardEffectLine(
    "If you have [Example] with 8000 power or more on your field, this Character gains +1000 power.",
  );

  expect(result).toMatchObject({
    block: {
      category: "permanent",
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: 1000,
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "fieldCount",
            player: "self",
            filter: {
              categories: ["character"],
              names: ["Example"],
              currentPower: { min: 8000 },
            },
          },
        },
      },
    },
  });
});
