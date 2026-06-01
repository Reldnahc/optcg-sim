import { expect, it } from "vitest";

import { parseLeaderColorCountCondition } from "./leader-color-count.js";

it("parses multicolored leader as a reusable leader color-count condition", () => {
  expect(
    parseLeaderColorCountCondition({ text: "your Leader is multicolored" }),
  ).toEqual({
    condition: {
      type: "leaderColorCount",
      player: "self",
      op: "gte",
      value: 2,
    },
    evidence: [
      "condition:leaderColorCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:self",
    ],
    rest: "",
  });
});
