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
