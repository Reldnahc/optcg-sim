import { expect, it } from "vitest";

import { parseSelfFieldCountCondition } from "./self-field-count.js";

it("parses self field-count thresholds with reusable card filters", () => {
  expect(
    parseSelfFieldCountCondition({
      text: "you have 2 or less Characters",
    }),
  ).toEqual({
    condition: {
      type: "fieldCount",
      player: "self",
      filter: { categories: ["character"] },
      op: "lte",
      value: 2,
    },
    evidence: [
      "condition:fieldCount",
      "condition:comparator:lte",
      "condition:threshold:positiveInteger",
      "player:self",
      "filter:category:character",
    ],
    rest: "",
  });
});

it("parses singular matching Character presence as a reusable field-count threshold", () => {
  expect(
    parseSelfFieldCountCondition({
      text: 'you have a Character with 8000 power or more and a type including "Whitebeard Pirates"',
    }),
  ).toEqual({
    condition: {
      type: "fieldCount",
      player: "self",
      filter: {
        categories: ["character"],
        currentPower: { min: 8000 },
        typesIncludeAny: ["Whitebeard Pirates"],
      },
      op: "gte",
      value: 1,
    },
    evidence: [
      "condition:fieldCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:self",
      "filter:category:character",
      "filter:currentPower",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "filter:type",
    ],
    rest: "",
  });
});
