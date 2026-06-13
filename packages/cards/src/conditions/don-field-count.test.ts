import { describe, expect, it } from "vitest";

import {
  donFieldCountConditionPrimitive,
  parseDonFieldCountCondition,
} from "./don-field-count.js";

describe("DON field count condition parser", () => {
  it("defines DON field count as a condition primitive parent", () => {
    expect(donFieldCountConditionPrimitive).toMatchObject({
      primitiveId: "condition:donFieldCount",
      childPrimitiveIds: [
        "player:self",
        "condition:comparator:lte",
        "condition:comparator:gte",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
        "filter:category:don",
        "filter:state:attached",
        "filter:state:active",
        "player:opponent",
      ],
    });
  });

  it("parses self DON field lte condition", () => {
    expect(
      parseDonFieldCountCondition({
        text: "you have 6 or less DON!! cards on your field",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: {
          categories: ["don"],
        },
        op: "lte",
        value: 6,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:category:don",
      ],
      rest: "",
    });
  });

  it("uses the same comparator parser for gte thresholds", () => {
    expect(
      parseDonFieldCountCondition({
        text: "you have 10 or more DON!! cards on your field",
      }),
    ).toMatchObject({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["don"] },
        op: "gte",
        value: 10,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:category:don",
      ],
    });
  });

  it("parses opponent DON on their field as the same opponent field-count primitive", () => {
    expect(
      parseDonFieldCountCondition({
        text: "your opponent has 6 or more DON!! cards on their field",
      }),
    ).toMatchObject({
      condition: {
        type: "fieldCount",
        player: "opponent",
        filter: { categories: ["don"] },
        op: "gte",
        value: 6,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:opponent",
        "filter:category:don",
      ],
      rest: "",
    });
  });

  it("uses the same comparator parser for exact thresholds", () => {
    expect(
      parseDonFieldCountCondition({
        text: "you have 10 DON!! cards on your field",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["don"] },
        op: "eq",
        value: 10,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:category:don",
      ],
      rest: "",
    });
  });

  it("parses active DON field-count conditions as state-filtered DON counts", () => {
    expect(
      parseDonFieldCountCondition({
        text: "you have 5 or less active DON!! cards",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["don"], state: "active" },
        op: "lte",
        value: 5,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:category:don",
        "filter:state:active",
      ],
      rest: "",
    });
  });

  it("parses any given DON as an attached DON field-count condition", () => {
    expect(
      parseDonFieldCountCondition({
        text: "you have any DON!! cards given",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["don"], state: "attached" },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:category:don",
        "filter:state:attached",
      ],
      rest: "",
    });
  });

  it("parses any DON on field as a reusable DON field-count condition", () => {
    expect(
      parseDonFieldCountCondition({
        text: "you have any DON!! cards on your field",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["don"] },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:category:don",
      ],
      rest: "",
    });
  });

  it("parses opponent given DON as the same attached DON field-count primitive", () => {
    expect(
      parseDonFieldCountCondition({
        text: "your opponent has any DON!! cards given",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "opponent",
        filter: { categories: ["don"], state: "attached" },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:opponent",
        "filter:category:don",
        "filter:state:attached",
      ],
      rest: "",
    });
  });

  it("parses total given DON as attached DON field-count data", () => {
    expect(
      parseDonFieldCountCondition({
        text: "you have a total of 2 or more given DON!! cards",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["don"], state: "attached" },
        op: "gte",
        value: 2,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:category:don",
        "filter:state:attached",
      ],
      rest: "",
    });
  });

  it("parses relative DON count differences as reusable field-count operands", () => {
    expect(
      parseDonFieldCountCondition({
        text: "the number of DON!! cards on your field is at least 2 less than the number on your opponent's field",
      }),
    ).toEqual({
      condition: {
        type: "fieldCountDifference",
        minuend: {
          player: "opponent",
          filter: { categories: ["don"] },
        },
        subtrahend: {
          player: "self",
          filter: { categories: ["don"] },
        },
        op: "gte",
        value: 2,
      },
      evidence: [
        "condition:fieldCountDifference",
        "player:opponent",
        "player:self",
        "filter:category:don",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "valueOffset:fieldCountDifference",
      ],
      rest: "",
    });
  });
});
