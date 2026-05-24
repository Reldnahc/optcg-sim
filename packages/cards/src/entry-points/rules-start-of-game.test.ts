import { describe, expect, it } from "vitest";

import { parseRulesStartOfGameEntryPoint } from "./rules-start-of-game.js";

describe("rules start-of-game entry-point parser", () => {
  it("parses deck-construction restriction separately from start-of-game effect text", () => {
    expect(
      parseRulesStartOfGameEntryPoint({
        text: "Under the rules of this game, you cannot include Events with a cost of 3 or more in your deck and at the start of the game, play up to 1 {Example} type Stage card from your deck.",
      }),
    ).toEqual({
      node: {
        type: "entryPoint",
        trigger: { type: "startOfGame" },
        category: "auto",
      },
      evidence: [
        "entry:startOfGame",
        "sourcePresence:noSourceRequired",
        "deckRestriction:ignored",
        "deckRestriction:eventCostGte",
        "filter:category:event",
        "filter:cost",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "play up to 1 {Example} type Stage card from your deck.",
    });
  });
});
