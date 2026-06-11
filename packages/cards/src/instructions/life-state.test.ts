import { describe, expect, it } from "vitest";

import { parseLifeStateInstruction } from "./life-state.js";

describe("Life state instruction parser", () => {
  it("parses opponent Life inspect and reorder as a private reorder primitive", () => {
    expect(
      parseLifeStateInstruction({
        text: "Look at all of your opponent's Life cards and place them back in their Life area in any order.",
      }),
    ).toEqual({
      effect: { type: "reorderLife", player: "opponent", viewer: "self" },
      evidence: [
        "instruction:reorder",
        "player:opponent",
        "zone:life",
        "visibility:private",
        "order:anyOrder",
      ],
      rest: "",
    });
  });

  it("parses turning all own Life face-down as a reusable Life state primitive", () => {
    expect(
      parseLifeStateInstruction({
        text: "Turn all of your Life cards face-down.",
      }),
    ).toEqual({
      effect: { type: "setLifeFaceUp", player: "self", faceUp: false },
      evidence: [
        "instruction:setState",
        "player:self",
        "zone:life",
        "destination:faceDown",
      ],
      rest: "",
    });
  });
});
