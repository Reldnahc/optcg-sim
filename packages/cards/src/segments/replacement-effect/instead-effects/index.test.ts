import { describe, expect, it } from "vitest";

import {
  parseReplacementInsteadFromSet,
  replacementInsteadBodyParsers,
} from "./index.js";

describe("replacement instead-effect parser groups", () => {
  it("parses replacement instead bodies through a semantic parser group", () => {
    expect(
      parseReplacementInsteadFromSet(
        "you may draw 1 card instead.",
        replacementInsteadBodyParsers,
      ),
    ).toEqual({
      effect: {
        type: "draw",
        count: 1,
        player: "self",
      },
      evidence: ["instruction:draw", "count:positiveInteger"],
    });
  });
});
