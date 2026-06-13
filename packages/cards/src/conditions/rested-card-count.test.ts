import { expect, it } from "vitest";

import {
  parseRestedCardCountCondition,
  restedCardCountConditionPrimitive,
} from "./rested-card-count.js";

it("defines rested card count as a field-count primitive parent", () => {
  expect(restedCardCountConditionPrimitive).toMatchObject({
    primitiveId: "condition:fieldCount",
    childPrimitiveIds: [
      "player:self",
      "condition:comparator:gte",
      "condition:comparator:lte",
      "condition:comparator:eq",
      "condition:threshold:positiveInteger",
      "player:opponent",
      "filter:state:rested",
      "filter:type",
      "filter:category:character",
    ],
  });
});

it("parses rested card thresholds as a reusable self field-count primitive", () => {
  expect(
    parseRestedCardCountCondition({
      text: "you have 8 or more rested cards",
    }),
  ).toEqual({
    condition: {
      type: "fieldCount",
      player: "self",
      filter: { state: "rested" },
      op: "gte",
      value: 8,
    },
    evidence: [
      "condition:fieldCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:self",
      "filter:state:rested",
    ],
    rest: "",
  });
});

it("parses rested card thresholds for opponent field counts", () => {
  expect(
    parseRestedCardCountCondition({
      text: "your opponent has 5 or more rested cards",
    }),
  ).toEqual({
    condition: {
      type: "fieldCount",
      player: "opponent",
      filter: { state: "rested" },
      op: "gte",
      value: 5,
    },
    evidence: [
      "condition:fieldCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:opponent",
      "filter:state:rested",
    ],
    rest: "",
  });
});

it("parses exact rested card thresholds through the same comparison primitive", () => {
  expect(
    parseRestedCardCountCondition({
      text: "you have 8 rested cards",
    }),
  ).toEqual({
    condition: {
      type: "fieldCount",
      player: "self",
      filter: { state: "rested" },
      op: "eq",
      value: 8,
    },
    evidence: [
      "condition:fieldCount",
      "condition:comparator:eq",
      "condition:threshold:positiveInteger",
      "player:self",
      "filter:state:rested",
    ],
    rest: "",
  });
});

it("parses rested Character thresholds with reusable filter predicates", () => {
  expect(
    parseRestedCardCountCondition({
      text: "you have 2 or more rested {ODYSSEY} type Characters",
    }),
  ).toEqual({
    condition: {
      type: "fieldCount",
      player: "self",
      filter: {
        categories: ["character"],
        typesAny: ["ODYSSEY"],
        state: "rested",
      },
      op: "gte",
      value: 2,
    },
    evidence: [
      "condition:fieldCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:self",
      "filter:state:rested",
      "filter:type",
      "filter:category:character",
    ],
    rest: "",
  });
});
