import { describe, expect, it } from "vitest";

import { parseConditionalWrapper } from "./conditional-generated-support-composer.js";

describe("conditional generated support composer", () => {
  it.each([
    {
      expectedPrefix: "[On Play] ",
      sourceText: "[On Play] If your Leader is multicolored, draw 2 cards.",
    },
    {
      expectedPrefix: "[When Attacking] [Once Per Turn] ",
      sourceText:
        "[When Attacking] [Once Per Turn] If your Leader has {Straw Hat Crew} type, draw 2 cards and trash 1 card from your hand.",
    },
    {
      expectedPrefix: "[On K.O.] ",
      sourceText:
        "[On K.O.] If your Leader has [Slash] attribute, draw up to 1 card.",
    },
    {
      expectedPrefix: "[Trigger] ",
      sourceText:
        "[Trigger] If you have 5 or less cards in your hand or your opponent has 1 or more Life cards, draw 1 card.",
    },
  ])(
    "parses supported conditional wrapper composition ($sourceText)",
    ({ expectedPrefix, sourceText }) => {
      const parsed = parseConditionalWrapper(sourceText);

      expect(parsed).toBeDefined();
      expect(parsed?.prefix).toBe(expectedPrefix);
      expect(parsed?.condition).toBeDefined();
    },
  );

  it("builds boolean AND block-level condition", () => {
    const parsed = parseConditionalWrapper(
      "[On Play] If your Leader is multicolored and you have 5 or less cards in your hand, draw 2 cards.",
    );

    expect(parsed?.condition).toEqual({
      conditions: [
        { op: "gte", player: "self", type: "leaderColorCount", value: 2 },
        { op: "lte", player: "self", type: "handCount", value: 5 },
      ],
      type: "and",
    });
  });

  it("builds block-level trashCount condition for self/opponent trash comparators", () => {
    const selfTrash = parseConditionalWrapper(
      "[On Play] If you have 2 or more cards in your trash, draw 1 card.",
    );
    const opponentTrash = parseConditionalWrapper(
      "[On Play] If your opponent has 3 cards in their trash, draw 1 card.",
    );

    expect(selfTrash?.condition).toEqual({
      op: "gte",
      player: "self",
      type: "trashCount",
      value: 2,
    });
    expect(opponentTrash?.condition).toEqual({
      op: "eq",
      player: "opponent",
      type: "trashCount",
      value: 3,
    });
  });

  it("fails closed on unsupported condition fragment", () => {
    expect(
      parseConditionalWrapper(
        "[On Play] If this Character is rested, draw 1 card.",
      ),
    ).toBeUndefined();
  });

  it("fails closed on ambiguous mixed and/or connectors", () => {
    expect(
      parseConditionalWrapper(
        "[On Play] If your Leader is multicolored and you have 5 or less cards in your hand or your opponent has 1 or more Life cards, draw 1 card.",
      ),
    ).toBeUndefined();
  });
});
