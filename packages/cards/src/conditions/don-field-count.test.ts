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
        "condition:threshold:positiveInteger",
        "filter:category:don",
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
});
