import { describe, expect, it } from "vitest";

import { parsePreventPlayInstruction } from "./prevent-play.js";

describe("prevent play instruction parser", () => {
  it("parses destination wording as reusable character play restriction", () => {
    expect(
      parsePreventPlayInstruction({
        text: "you cannot play any Character cards on your field during this turn.",
      }),
    ).toEqual({
      effect: {
        type: "preventPlay",
        player: "self",
        filter: { categories: ["character"] },
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:preventPlay",
        "player:self",
        "zone:hand",
        "duration:thisTurn",
        "filter:category:character",
      ],
      rest: "",
    });
  });
});
