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

  it("emits separate body spans for search reveal selection and remaining cards", () => {
    const text =
      "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.";
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
    const selection = spans.find((span) => span.id === "span:search:selection");
    const remaining = spans.find((span) => span.id === "span:search:remaining");

    expect(selection).toMatchObject({
      role: "body",
      text: "Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand.",
    });
    expect(selection?.primitiveEvidence).toContain("instruction:search");
    expect(remaining).toMatchObject({
      role: "body",
      text: "Then, place the rest at the bottom of your deck in any order.",
    });
    expect(remaining?.primitiveEvidence).toContain("remaining:bottomDeck");
    expect(spans.some((span) => span.id === "span:body")).toBe(false);
  });

  it.each([
    [
      "reveal-top play-rested",
      "[DON!! x2] [When Attacking] ➀ (You may rest the specified number of DON!! cards in your cost area.): Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea} type Character card with a cost of 4 or less, you may play that card rested.",
      "instruction:revealTop",
    ],
    [
      "start-of-game stage play",
      "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck and at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.",
      "instruction:playSelected",
    ],
    [
      "blocker restriction sequence",
      "[Main] Select up to 1 of your {The Seven Warlords of the Sea} type Leader or Character cards and that card gains +2000 power during this turn. Then, if the selected card attacks during this turn, your opponent cannot activate [Blocker].",
      "instruction:preventBlockerActivation",
    ],
  ])(
    "emits a body span for custom expression parser: %s",
    (_name, text, evidence) => {
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
            span.role === "body" && span.primitiveEvidence?.includes(evidence),
        ),
      ).toBe(true);
    },
  );

  it("emits a body span for leading conditional effect bodies", () => {
    const text =
      "[When Attacking] If you have 6 or less DON!! cards on your field, give up to 1 of your opponent's Characters −1000 power during this turn.";
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
    expect(spans.some((span) => span.role === "body")).toBe(true);
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
