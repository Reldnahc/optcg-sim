import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  gameplayLinesFromTextParts,
  gameplayLineSlicesFromTextParts,
} from "./effect-text-lines.js";

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

  it("groups opponent-chooses-one headers and bullets", () => {
    const lines = gameplayLinesFromTextParts([
      `[On Play] You may trash 1 card from your hand: Your opponent chooses one:
\u2022 Your opponent trashes 2 cards from their hand.
\u2022 Trash 1 card from the top of your opponent's Life cards.`,
    ]);

    assert.deepEqual(lines, [
      `[On Play] You may trash 1 card from your hand: Your opponent chooses one:
\u2022 Your opponent trashes 2 cards from their hand.
\u2022 Trash 1 card from the top of your opponent's Life cards.`,
    ]);
  });

  it("groups apply-each headers with their bullet effects", () => {
    const lines = gameplayLinesFromTextParts([
      `Apply each of the following effects based on the number of cards in your trash:
\u2022 If there are 10 or more cards, this Character's base power becomes 9000 and it gains +10 cost.
\u2022 If you have 20 or more cards, during your opponent's turn, your Leader's base power becomes 7000.
\u2022 If you have 30 or more cards, this Character gains +1000 power.
[On Play] Draw 1 card.`,
    ]);

    assert.deepEqual(lines, [
      `Apply each of the following effects based on the number of cards in your trash:
\u2022 If there are 10 or more cards, this Character's base power becomes 9000 and it gains +10 cost.
\u2022 If you have 20 or more cards, during your opponent's turn, your Leader's base power becomes 7000.
\u2022 If you have 30 or more cards, this Character gains +1000 power.`,
      "[On Play] Draw 1 card.",
    ]);
  });

  it("joins detached entry and marker lines to their following effect bodies", () => {
    const lines = gameplayLinesFromTextParts([
      `[On Play]
 Draw 1 card and trash 1 card from your hand.
[Activate: Main]

[Once Per Turn]
 Give up to 1 rested DON!! card to 1 of your [Nami] cards.`,
    ]);

    assert.deepEqual(lines, [
      "[On Play] Draw 1 card and trash 1 card from your hand.",
      "[Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to 1 of your [Nami] cards.",
    ]);
  });

  it("preserves ranges while grouping choose-one blocks and trailing Then lines", () => {
    const text = `[Main] Choose one:
\u2022 Draw 2 cards.
\u2022 Rest up to 1 Character.
Then, draw 1 card.`;
    const lines = gameplayLineSlicesFromTextParts([text]);
    const line = lines[0];

    assert.equal(lines.length, 1);
    assert.ok(line);
    assert.equal(line.text, text);
    assert.equal(line.start, 0);
    assert.equal(line.end, text.length);
  });

  it("preserves ranges while grouping apply-each bullet blocks", () => {
    const text = `Apply each of the following effects based on the number of cards in your trash:
\u2022 If there are 10 or more cards, this Character's base power becomes 9000 and it gains +10 cost.
\u2022 If you have 30 or more cards, this Character gains +1000 power.`;
    const lines = gameplayLineSlicesFromTextParts([text]);
    const line = lines[0];

    assert.equal(lines.length, 1);
    assert.ok(line);
    assert.equal(line.text, text);
    assert.equal(line.start, 0);
    assert.equal(line.end, text.length);
  });

  it("preserves ranges when joining detached effect headers", () => {
    const text = `[On Play]
Draw 1 card.`;
    const lines = gameplayLineSlicesFromTextParts([text]);
    const line = lines[0];

    assert.equal(lines.length, 1);
    assert.ok(line);
    assert.equal(line.text, "[On Play] Draw 1 card.");
    assert.equal(line.rawText, text);
    assert.equal(line.start, 0);
    assert.equal(line.end, text.length);
  });
});
