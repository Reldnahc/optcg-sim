import { expect, test } from "vitest";

import { parseCardEffectLinesDetailed } from "../../packages/cards/src/card-effect-line-parser/index.js";

test("effect presentation pipeline maps original text to active sequence target span", () => {
  const text =
    "[On Play] DON!! -1: Draw 1 card. Then, K.O. up to 1 of your opponent's Characters with a cost of 2 or less.";
  const parsed = parseCardEffectLinesDetailed(text);

  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    return;
  }
  const line = parsed.value[0];
  if (line === undefined || !("block" in line)) {
    throw new Error("Expected runtime line.");
  }
  const spans = line.sourceMap?.spans ?? [];
  const koSpan = spans.find((span) => span.id === "span:sequence:1:body");
  if (koSpan === undefined) {
    throw new Error("Expected KO sequence body span.");
  }

  expect(koSpan.text).toContain("K.O. up to 1");
  expect(text.slice(koSpan.start, koSpan.end)).toBe(koSpan.text);
});
