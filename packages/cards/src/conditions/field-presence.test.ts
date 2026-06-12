import { expect, it } from "vitest";

import { parseFieldPresenceCondition } from "./field-presence.js";

it("parses any-player field presence as reusable self or opponent field counts", () => {
  const result = parseFieldPresenceCondition({
    text: "there is a Character with 8000 power or more",
  });

  expect(result).toMatchObject({
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
          op: "gte",
          value: 1,
        },
        {
          type: "fieldCount",
          player: "opponent",
          filter: {
            categories: ["character"],
            currentPower: { min: 8000 },
          },
          op: "gte",
          value: 1,
        },
      ],
    },
    rest: "",
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "composition:conditionOr",
      "condition:fieldCount",
      "condition:opponentFieldCount",
      "filter:currentPower",
    ]),
  );
});

it("distributes cost alternatives into reusable field-count branches", () => {
  const result = parseFieldPresenceCondition({
    text: "there is a Character with a cost of 0 or with a cost of 8 or more",
  });

  expect(result).toMatchObject({
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
        },
        {
          type: "fieldCount",
          player: "opponent",
          filter: {
            categories: ["character"],
            cost: { op: "eq", value: 0 },
          },
        },
        {
          type: "fieldCount",
          player: "self",
          filter: {
            categories: ["character"],
            cost: { min: 8 },
          },
        },
        {
          type: "fieldCount",
          player: "opponent",
          filter: {
            categories: ["character"],
            cost: { min: 8 },
          },
        },
      ],
    },
    rest: "",
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "composition:conditionOr",
      "filter:cost",
      "condition:comparator:eq",
      "condition:comparator:gte",
      "condition:threshold:nonNegativeInteger",
      "condition:threshold:positiveInteger",
    ]),
  );
});
