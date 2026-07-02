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

  it("emits connector and sequence body spans for and-separated effects", () => {
    const text =
      "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.";
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
      spans.some((span) => span.role === "connector" && span.text === "and"),
    ).toBe(true);
    expect(spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "span:sequence:0:body",
          role: "body",
          text: "Draw 2 cards",
        }),
        expect.objectContaining({
          id: "span:sequence:1:body",
          role: "body",
          text: "trash 1 card from your hand.",
        }),
      ]),
    );
    expect(spans.some((span) => span.id === "span:body")).toBe(false);
  });

  it("scopes nested sequence body span ids under the outer sequence segment", () => {
    const text =
      "[Main] Your Leader gains +3000 power during this turn and give up to 1 of your opponent's Characters -8000 power until the end of your opponent's next End Phase. Then, you may trash 2 cards from your hand. If you do, K.O. up to 1 of your opponent's Characters with 0 power or less.";
    const result = parseCardEffectLinesDetailed(text);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const parsed = result.value[0];
    if (parsed === undefined || !("block" in parsed)) {
      throw new Error("Expected runtime effect line.");
    }

    const spanIds = (parsed.sourceMap?.spans ?? []).map((span) => span.id);
    expect(new Set(spanIds).size).toBe(spanIds.length);
    expect(spanIds).toEqual(
      expect.arrayContaining([
        "span:sequence:0:sequence:0:body",
        "span:sequence:0:sequence:1:body",
        "span:sequence:1:body",
      ]),
    );
  });

  it("scopes condition span ids inside sequence segments", () => {
    const text =
      "[On Play] If your Leader has the {East Blue} type, rest up to 1 of your opponent's Characters with a cost of 2 or less and, if you don't have [Buchi], play up to 1 [Buchi] from your hand.";
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
    const spanIds = spans.map((span) => span.id);
    expect(new Set(spanIds).size).toBe(spanIds.length);
    expect(spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "span:condition:resolution",
          role: "condition",
          text: "your Leader has the {East Blue} type",
        }),
        expect.objectContaining({
          id: "span:sequence:1:condition:resolution",
          role: "condition",
          text: "you don't have [Buchi]",
        }),
      ]),
    );
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

  it("emits separate optional trash cost and post-cost body spans", () => {
    const text =
      "[On Play] You may trash 1 card from your hand: If your Leader is [Rebecca]\u2060, this Character gains [Rush] during this turn.";
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
          span.role === "cost" &&
          span.text === "You may trash 1 card from your hand" &&
          span.primitiveEvidence?.includes("cost:trashFromHand"),
      ),
    ).toBe(true);
    expect(
      spans.some(
        (span) =>
          span.role === "condition" &&
          span.text === "your Leader is [Rebecca]" &&
          span.primitiveEvidence?.includes("condition:leaderIdentity"),
      ),
    ).toBe(true);
    expect(
      spans.some(
        (span) =>
          span.role === "body" &&
          span.text === "this Character gains [Rush] during this turn." &&
          span.primitiveEvidence?.includes("instruction:giveKeyword"),
      ),
    ).toBe(true);
  });

  it("emits cost and body spans for return-to-owner-hand costed effects", () => {
    const text =
      "[Activate: Main] You may rest this Leader and return 1 of your {Dressrosa} type Characters to the owner's hand: Play up to 1 {Dressrosa} type Character card with a cost of 3 from your hand.";
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
    expect(spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "span:cost:optional",
          role: "cost",
          text: "You may rest this Leader and return 1 of your {Dressrosa} type Characters to the owner's hand",
        }),
        expect.objectContaining({
          id: "span:body",
          role: "body",
          text: "Play up to 1 {Dressrosa} type Character card with a cost of 3 from your hand.",
        }),
      ]),
    );
  });

  it("emits cost and body spans for choose-one trash costed effects", () => {
    const examples = [
      {
        text: "[On Play] You may trash 1 {Fish-Man} type card from your hand or 1 [The Ark Noah] from your hand or field: K.O. up to 1 of your opponent's rested Characters.",
        cost: "You may trash 1 {Fish-Man} type card from your hand or 1 [The Ark Noah] from your hand or field",
        body: "K.O. up to 1 of your opponent's rested Characters.",
      },
      {
        text: "[Activate: Main] [Once Per Turn] You may trash 1 of your {Celestial Dragons} type Characters or 1 card from your hand: Draw 1 card.",
        cost: "You may trash 1 of your {Celestial Dragons} type Characters or 1 card from your hand",
        body: "Draw 1 card.",
      },
    ] as const;

    for (const example of examples) {
      const result = parseCardEffectLinesDetailed(example.text);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      const parsed = result.value[0];
      if (parsed === undefined || !("block" in parsed)) {
        throw new Error("Expected runtime effect line.");
      }

      const spans = parsed.sourceMap?.spans ?? [];
      expect(spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "span:cost:optional",
            role: "cost",
            text: example.cost,
          }),
          expect.objectContaining({
            id: "span:body",
            role: "body",
            text: example.body,
          }),
        ]),
      );
    }
  });

  it("emits choice header, bullet option, and option body spans", () => {
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
    expect(spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "span:choice:0:body",
          role: "body",
          text: "Draw 2 cards.",
        }),
        expect.objectContaining({
          id: "span:choice:1:body",
          role: "body",
          text: "Rest up to 1 of your opponent's Characters.",
        }),
      ]),
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
    expect(selection?.primitiveEvidence).toContain("instruction:revealTop");
    expect(selection?.primitiveEvidence).toContain("instruction:selectFromSet");
    expect(selection?.primitiveEvidence).toContain(
      "instruction:revealSelected",
    );
    expect(remaining).toMatchObject({
      role: "body",
      text: "Then, place the rest at the bottom of your deck in any order.",
    });
    expect(remaining?.primitiveEvidence).toContain("remaining:bottomDeck");
    expect(spans.some((span) => span.id === "span:body")).toBe(false);
  });

  it("emits separate body spans for top-deck play selection and remaining cards", () => {
    const text =
      "[Counter] Look at 5 cards from the top of your deck and play up to 1 {Animal} type Character card with a cost of 3 or less. Then, place the rest at the bottom of your deck in any order.";
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
      text: "Look at 5 cards from the top of your deck and play up to 1 {Animal} type Character card with a cost of 3 or less.",
    });
    expect(selection?.primitiveEvidence).toContain("instruction:revealTop");
    expect(selection?.primitiveEvidence).toContain("instruction:selectFromSet");
    expect(selection?.primitiveEvidence).toContain("instruction:playSelected");
    expect(remaining).toMatchObject({
      role: "body",
      text: "Then, place the rest at the bottom of your deck in any order.",
    });
    expect(remaining?.primitiveEvidence).toContain(
      "instruction:placeSetRemainder",
    );
    expect(spans.some((span) => span.id === "span:lookPlay")).toBe(false);
  });

  it("emits separate body spans for reveal-top play selection and remaining cards", () => {
    const text =
      '[On Play] Reveal 1 card from the top of your deck and play up to 1 Character card with a type including "Whitebeard Pirates" and a cost of 4 or less. Then, place the rest at the top or bottom of your deck.';
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
      text: 'Reveal 1 card from the top of your deck and play up to 1 Character card with a type including "Whitebeard Pirates" and a cost of 4 or less.',
    });
    expect(selection?.primitiveEvidence).toContain("instruction:revealTop");
    expect(selection?.primitiveEvidence).toContain("instruction:selectFromSet");
    expect(selection?.primitiveEvidence).toContain("instruction:playSelected");
    expect(remaining).toMatchObject({
      role: "body",
      text: "Then, place the rest at the top or bottom of your deck.",
    });
    expect(remaining?.primitiveEvidence).toContain(
      "instruction:placeSetRemainder",
    );
    expect(spans.some((span) => span.id === "span:revealPlay")).toBe(false);
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

  it("emits a body span for activated reaction bodies rewritten for optional costs", () => {
    const text =
      "This effect can be activated when this Character is rested by your opponent's effect. You may trash this Character and draw 2 cards.";
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
          span.role === "body" &&
          span.text === "You may trash this Character and draw 2 cards." &&
          span.primitiveEvidence?.includes("instruction:draw"),
      ),
    ).toBe(true);
  });

  it("emits a body span for draw-for-each-field then trash-same effects", () => {
    const text =
      "[On Play] Draw a card for each of your {Neptunian} type Characters. Then, trash the same number of cards from your hand.";
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
      spans.some((span) => {
        const evidence = span.primitiveEvidence ?? [];
        return (
          span.role === "body" &&
          span.text ===
            "Draw a card for each of your {Neptunian} type Characters. Then, trash the same number of cards from your hand." &&
          evidence.includes("instruction:draw") &&
          evidence.includes("instruction:trashFromHand")
        );
      }),
    ).toBe(true);
  });

  it("emits cost and body spans for returned-count power effects", () => {
    const text =
      "[Counter] If your Leader is [Uta], you may return any number of Characters on your field to the owner's hand. Up to 1 of your Leader or Character cards gains +2000 power during this battle for every returned Character.";
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
    expect(spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "span:cost:optional",
          role: "cost",
          text: "you may return any number of Characters on your field to the owner's hand",
        }),
        expect.objectContaining({
          role: "body",
          text: "Up to 1 of your Leader or Character cards gains +2000 power during this battle for every returned Character.",
        }),
      ]),
    );
    expect(
      spans.some(
        (span) =>
          span.role === "cost" &&
          span.primitiveEvidence?.includes("cost:returnToOwnerHand"),
      ),
    ).toBe(true);
    expect(
      spans.some(
        (span) =>
          span.role === "body" &&
          span.primitiveEvidence?.includes("instruction:modifyPower"),
      ),
    ).toBe(true);
  });
});
