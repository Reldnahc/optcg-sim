import { describe, expect, it } from "vitest";

import {
  parseTrashCountCondition,
  trashCountConditionPrimitive,
} from "./trash-count.js";

describe("trash count condition parser", () => {
  it("defines trash count as a primitive parent with match families", () => {
    expect(trashCountConditionPrimitive).toMatchObject({
      primitiveId: "condition:trashCount",
      matches: [
        {
          id: "you-have-n-or-more-cards-in-your-trash",
        },
      ],
    });
  });

  it("parses self trash count thresholds", () => {
    expect(
      parseTrashCountCondition({
        text: "you have 7 or more cards in your trash",
      }),
    ).toEqual({
      condition: {
        type: "trashCount",
        player: "self",
        op: "gte",
        value: 7,
      },
      evidence: [
        "condition:trashCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
      ],
      rest: "",
    });
  });
});
