import { describe, expect, it } from "vitest";

import { parseCardEffectLinesDetailed } from "./card-effect-line-parser/index.js";

describe("card effect parser source maps", () => {
  it("emits exact source text and top-level spans for a simple On Play line", () => {
    const text = "[On Play] Draw 1 card.";
    const result = parseCardEffectLinesDetailed(text);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const parsed = result.value[0];
    if (parsed === undefined || !("block" in parsed)) {
      throw new Error("Expected runtime effect line.");
    }

    expect(parsed.sourceMap?.sourceText).toBe(text);
    expect(parsed.sourceMap?.spans.map((span) => span.role)).toContain("entry");
    expect(parsed.sourceMap?.spans.map((span) => span.role)).toContain("body");
  });

  it("emits connector and sequence body spans for Then-separated effects", () => {
    const text =
      "[On Play] Draw 1 card. Then, K.O. up to 1 of your opponent's Characters with a cost of 2 or less.";
    const result = parseCardEffectLinesDetailed(text);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const parsed = result.value[0];
    if (parsed === undefined || !("block" in parsed)) {
      throw new Error("Expected runtime effect line.");
    }

    const spans = parsed.sourceMap?.spans ?? [];
    expect(
      spans.some((span) => span.role === "connector" && span.text === "Then,"),
    ).toBe(true);
    expect(spans.some((span) => span.id === "span:sequence:0:body")).toBe(true);
    expect(spans.some((span) => span.id === "span:sequence:1:body")).toBe(true);
  });

  it("emits separate cost and post-cost body spans", () => {
    const text = "[On Play] DON!! -1: Draw 1 card.";
    const result = parseCardEffectLinesDetailed(text);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const parsed = result.value[0];
    if (parsed === undefined || !("block" in parsed)) {
      throw new Error("Expected runtime effect line.");
    }

    const spans = parsed.sourceMap?.spans ?? [];
    expect(
      spans.some((span) => span.role === "cost" && span.text.includes("DON!!")),
    ).toBe(true);
    expect(
      spans.some(
        (span) => span.role === "body" && span.text === "Draw 1 card.",
      ),
    ).toBe(true);
  });

  it("emits choice header and bullet option spans", () => {
    const text = `[Main] Choose one:
\u2022 Draw 2 cards.
\u2022 Rest up to 1 of your opponent's Characters.`;
    const result = parseCardEffectLinesDetailed(text);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const parsed = result.value[0];
    if (parsed === undefined || !("block" in parsed)) {
      throw new Error("Expected runtime effect line.");
    }

    const spans = parsed.sourceMap?.spans ?? [];
    expect(
      spans.some(
        (span) => span.role === "choice" && span.text.includes("Choose one"),
      ),
    ).toBe(true);
    expect(spans.filter((span) => span.role === "choiceOption")).toHaveLength(
      2,
    );
  });

  it("emits condition spans for conditional expression text", () => {
    const text =
      "[On Play] Draw 4 cards if your opponent has 3 or less Life cards.";
    const result = parseCardEffectLinesDetailed(text);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const parsed = result.value[0];
    if (parsed === undefined || !("block" in parsed)) {
      throw new Error("Expected runtime effect line.");
    }

    const spans = parsed.sourceMap?.spans ?? [];
    expect(
      spans.some(
        (span) =>
          span.role === "condition" &&
          span.text === "your opponent has 3 or less Life cards",
      ),
    ).toBe(true);
  });
});
