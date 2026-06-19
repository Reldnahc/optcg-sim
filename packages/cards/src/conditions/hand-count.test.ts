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

it("parses zero hand-count thresholds as non-negative reusable conditions", () => {
  expect(
    parseHandCountCondition({ text: "you have 0 cards in your hand" }),
  ).toEqual({
    condition: {
      type: "handCount",
      player: "self",
      op: "eq",
      value: 0,
    },
    evidence: [
      "condition:handCount",
      "condition:comparator:eq",
      "condition:threshold:nonNegativeInteger",
      "player:self",
    ],
    rest: "",
  });
});

it("parses hand-count differences as reusable player count operands", () => {
  expect(
    parseHandCountCondition({
      text: "the number of cards in your hand is at least 3 less than the number in your opponent's hand",
    }),
  ).toEqual({
    condition: {
      type: "handCountDifference",
      minuend: { player: "opponent" },
      subtrahend: { player: "self" },
      op: "gte",
      value: 3,
    },
    evidence: [
      "condition:handCountDifference",
      "player:opponent",
      "player:self",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "valueOffset:handCountDifference",
    ],
    rest: "",
  });
});
