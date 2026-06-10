import { describe, expect, it } from "vitest";

import { parseTrashSelfCost } from "./trash-self.js";

describe("trash self cost parser", () => {
  it("parses trash this Character as a reusable self-trash cost", () => {
    const result = parseTrashSelfCost({
      text: "trash this Character",
    });

    expect(result).toEqual({
      cost: { type: "trashSelf", optional: true },
      evidence: ["cost:trashSelf", "target:thisCharacter"],
      rest: "",
    });
  });

  it("parses reusable predicates on trash this Character costs", () => {
    const result = parseTrashSelfCost({
      text: "trash this Character with a cost of 20 or more",
    });

    expect(result).toEqual({
      cost: {
        type: "trashSelf",
        optional: true,
        filter: { categories: ["character"], cost: { min: 20 } },
      },
      evidence: [
        "cost:trashSelf",
        "target:thisCharacter",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });
});
