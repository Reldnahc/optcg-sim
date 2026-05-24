import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("text-only support probe parser backend", () => {
  it("parses text without requiring card IDs or fixtures", () => {
    expect(parseCardEffectLine("[On Play] Draw 1 card.")).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: { type: "draw", count: 1, player: "self" },
      },
    });
  });
});
