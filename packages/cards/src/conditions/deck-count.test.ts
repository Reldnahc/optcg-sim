import { expect, it } from "vitest";

import { parseDeckCountCondition } from "./deck-count.js";

it("parses self deck-count equality as reusable condition data", () => {
  expect(parseDeckCountCondition({ text: "your deck has 0 cards" })).toEqual({
    condition: {
      type: "deckCount",
      player: "self",
      op: "eq",
      value: 0,
    },
    evidence: [
      "condition:deckCount",
      "condition:comparator:eq",
      "condition:threshold:nonNegativeInteger",
      "player:self",
      "zone:deck",
    ],
    rest: "",
  });
});

it.each([
  ["you have 20 or less cards in your deck", "lte", 20],
  ["you have 20 or more cards in your deck", "gte", 20],
] as const)(
  "parses self deck-count threshold wording: %s",
  (text, op, value) => {
    expect(parseDeckCountCondition({ text })).toEqual({
      condition: {
        type: "deckCount",
        player: "self",
        op,
        value,
      },
      evidence: [
        "condition:deckCount",
        `condition:comparator:${op}`,
        "condition:threshold:nonNegativeInteger",
        "player:self",
        "zone:deck",
      ],
      rest: "",
    });
  },
);
