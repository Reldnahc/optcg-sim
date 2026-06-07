import { describe, expect, it } from "vitest";

import {
  consumeSourcePrefix,
  createSourceSlice,
  sourceSpan,
  splitSourceByDelimiter,
  trimSource,
} from "./source-slices.js";

describe("source slice helpers", () => {
  it("trims parser text while preserving raw character offsets", () => {
    const source = createSourceSlice("  [On Play] Draw 1 card.  ");
    const trimmed = trimSource(source);

    expect(trimmed.text).toBe("[On Play] Draw 1 card.");
    expect(trimmed.start).toBe(2);
    expect(trimmed.end).toBe(24);
    expect(trimmed.rawText).toBe("[On Play] Draw 1 card.");
  });

  it("consumes a prefix and returns the remaining ranged slice", () => {
    const source = createSourceSlice("[On Play] Draw 1 card.");
    const consumed = consumeSourcePrefix(source, "[On Play]");

    expect(consumed?.consumed.text).toBe("[On Play]");
    expect(consumed?.rest.text).toBe("Draw 1 card.");
    expect(consumed?.rest.start).toBe(10);
  });

  it("splits on Then while preserving delimiter spans", () => {
    const source = createSourceSlice(
      "Draw 1 card. Then, K.O. up to 1 Character.",
    );
    const split = splitSourceByDelimiter(source, /\s+Then,\s+/u, "then");

    expect(split?.segments.map((segment) => segment.text)).toEqual([
      "Draw 1 card.",
      "K.O. up to 1 Character.",
    ]);
    expect(split?.delimiters[0]?.text).toBe("Then,");
    expect(split?.delimiters[0]?.start).toBe(13);
  });

  it("creates a span from a slice", () => {
    const source = createSourceSlice("[On Play] Draw 1 card.");
    const span = sourceSpan("span:entry", "entry", source, ["entry:onPlay"]);

    expect(span.start).toBe(0);
    expect(span.end).toBe(22);
    expect(span.primitiveEvidence).toEqual(["entry:onPlay"]);
  });
});
