import { describe, expect, it } from "vitest";

import {
  lifeCountConditionPrimitive,
  parseLifeCountDifferenceCondition,
  parseLifeCountCondition,
} from "./life-count.js";

describe("life count condition parser", () => {
  it("parses self Life count thresholds as reusable condition primitives", () => {
    expect(lifeCountConditionPrimitive.primitiveId).toBe("condition:lifeCount");
    expect(
      parseLifeCountCondition({ text: "you have 3 or less Life cards" }),
    ).toEqual({
      condition: {
        type: "lifeCount",
        player: "self",
        op: "lte",
        value: 3,
      },
      evidence: [
        "condition:lifeCount",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "player:self",
      ],
      rest: "",
    });
    expect(
      parseLifeCountCondition({ text: "you have 4 or more Life cards" }),
    ).toMatchObject({
      condition: {
        type: "lifeCount",
        player: "self",
        op: "gte",
        value: 4,
      },
    });
    expect(
      parseLifeCountCondition({
        text: "your opponent has 3 or less Life cards",
      }),
    ).toEqual({
      condition: {
        type: "lifeCount",
        player: "opponent",
        op: "lte",
        value: 3,
      },
      evidence: [
        "condition:lifeCount",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "player:opponent",
      ],
      rest: "",
    });
    expect(
      parseLifeCountCondition({
        text: "your opponent has 1 Life card",
      }),
    ).toMatchObject({
      condition: {
        type: "lifeCount",
        player: "opponent",
        op: "eq",
        value: 1,
      },
    });
  });

  it("parses player-vs-opponent Life count comparisons as reusable operands", () => {
    expect(
      parseLifeCountDifferenceCondition({
        text: "you have less Life cards than your opponent",
      }),
    ).toEqual({
      condition: {
        type: "lifeCountDifference",
        minuend: { player: "opponent" },
        subtrahend: { player: "self" },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:lifeCountDifference",
        "player:opponent",
        "player:self",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });
});
