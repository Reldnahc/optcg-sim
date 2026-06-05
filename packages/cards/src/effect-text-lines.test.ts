import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { gameplayLinesFromTextParts } from "./effect-text-lines.js";

describe("gameplayLinesFromTextParts", () => {
  it("groups choose-one headers, bullets, and trailing Then lines", () => {
    const lines = gameplayLinesFromTextParts([
      `[Main] Choose one:
\u2022 K.O. up to 1 of your opponent's Characters with a cost of 1 or less.
\u2022 Return up to 1 of your opponent's Characters with a cost of 1 or less to the owner's hand.
Then, if you have a {Celestial Dragons} type Character, draw 1 card.
[On Play] Draw 1 card.`,
    ]);

    assert.deepEqual(lines, [
      `[Main] Choose one:
\u2022 K.O. up to 1 of your opponent's Characters with a cost of 1 or less.
\u2022 Return up to 1 of your opponent's Characters with a cost of 1 or less to the owner's hand.
Then, if you have a {Celestial Dragons} type Character, draw 1 card.`,
      "[On Play] Draw 1 card.",
    ]);
  });
});
