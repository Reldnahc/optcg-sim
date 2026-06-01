import { expect, it } from "vitest";

import { parseHandCountCondition } from "./hand-count.js";

it("parses self and opponent hand-count thresholds as the same reusable condition", () => {
  expect(
    parseHandCountCondition({ text: "you have 5 or less cards in your hand" }),
  ).toEqual({
    condition: {
      type: "handCount",
      player: "self",
      op: "lte",
      value: 5,
    },
    evidence: [
      "condition:handCount",
      "condition:comparator:lte",
      "condition:threshold:positiveInteger",
      "player:self",
    ],
    rest: "",
  });

  expect(
    parseHandCountCondition({
      text: "your opponent has 6 or more cards in their hand",
    }),
  ).toEqual({
    condition: {
      type: "handCount",
      player: "opponent",
      op: "gte",
      value: 6,
    },
    evidence: [
      "condition:handCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:opponent",
    ],
    rest: "",
  });
});
