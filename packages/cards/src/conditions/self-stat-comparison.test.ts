import { expect, it } from "vitest";

import { parseSelfStatComparisonCondition } from "./self-stat-comparison.js";

it("parses this Character current power comparisons as card stat conditions", () => {
  expect(
    parseSelfStatComparisonCondition({
      text: "this Character has 5000 power or more",
    }),
  ).toEqual({
    condition: {
      type: "cardStatComparison",
      target: { type: "self" },
      stat: "currentPower",
      op: "gte",
      value: 5000,
    },
    evidence: [
      "condition:cardStatComparison",
      "condition:stat:currentPower",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "target:thisCharacter",
    ],
    rest: "",
  });
});
