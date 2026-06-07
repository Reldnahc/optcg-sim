import { describe, expect, it } from "vitest";

import { splitTextByHighlightRanges } from "./effect-text-ranges.js";

describe("effect text ranges", () => {
  it("splits original text into active and inactive chunks", () => {
    const chunks = splitTextByHighlightRanges("[On Play] Draw 1 card.", [
      { start: 10, end: 22, state: "active" },
    ]);

    expect(chunks).toEqual([
      { text: "[On Play] ", state: "normal" },
      { text: "Draw 1 card.", state: "active" },
    ]);
  });

  it("ignores invalid ranges instead of changing source text", () => {
    const chunks = splitTextByHighlightRanges("Draw 1 card.", [
      { start: -1, end: 4, state: "active" },
      { start: 5, end: 99, state: "resolved" },
    ]);

    expect(chunks).toEqual([{ text: "Draw 1 card.", state: "normal" }]);
  });
});
