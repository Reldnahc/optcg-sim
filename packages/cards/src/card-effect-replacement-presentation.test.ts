import assert from "node:assert/strict";
import { test } from "vitest";

import type { ParsedRuntimeEffectLine } from "./types.js";
import { parseCardEffectLineDetailed } from "./card-effect-line-parser.js";

const parseRuntimeEffectLine = (text: string): ParsedRuntimeEffectLine => {
  const result = parseCardEffectLineDetailed(text);
  if (!result.ok || result.value.kind === "metadata") {
    assert.fail("expected parsed replacement effect block");
  }

  return result.value;
};

test("replacement effects emit a body presentation span for spotlight materialization", () => {
  const result = parseRuntimeEffectLine(
    "[Once Per Turn] If your {Red-Haired Pirates} type Character would be K.O.'d, you may trash 1 Character card with 6000 power or more from your hand instead.",
  );

  assert.deepEqual(
    result.sourceMap?.spans
      .filter((span) => span.role === "body")
      .map((span) => ({
        id: span.id,
        text: span.text,
      })),
    [
      {
        id: "span:body",
        text: "If your {Red-Haired Pirates} type Character would be K.O.'d, you may trash 1 Character card with 6000 power or more from your hand instead.",
      },
    ],
  );
});
