import { describe, expect, it } from "vitest";

import { parseConditionFromSet } from "./groups.js";
import { parseTrashCountCondition } from "./trash-count.js";

describe("condition parser groups", () => {
  it("parses conditions through a semantic parser group", () => {
    expect(
      parseConditionFromSet(
        { text: "you have 10 or more cards in your trash" },
        [parseTrashCountCondition],
      ),
    ).toMatchObject({
      condition: {
        type: "trashCount",
        player: "self",
        op: "gte",
        value: 10,
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
