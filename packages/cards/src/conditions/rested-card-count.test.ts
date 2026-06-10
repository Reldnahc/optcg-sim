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
      "filter:state:rested",
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
