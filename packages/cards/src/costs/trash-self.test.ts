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
});
