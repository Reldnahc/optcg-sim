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
