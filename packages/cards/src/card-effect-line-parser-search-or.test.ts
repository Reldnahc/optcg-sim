import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses top-deck search with exact-name-or-event filter as reusable OR predicates", () => {
  const result = parseCardEffectLine(
    "[On Play] Look at 4 cards from the top of your deck; reveal up to 1 [Sanji] or Event card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "search",
        request: {
          zone: "deck",
          player: "self",
          lookCount: 4,
          filter: {
            anyOf: [{ names: ["Sanji"] }, { categories: ["event"] }],
          },
          min: 0,
          max: 1,
          destination: "hand",
          revealTo: "bothPlayers",
          remainingCards: {
            destination: "deck",
            position: "bottom",
            order: "ownerChoice",
          },
          shuffleAfter: false,
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:search",
      "look:topDeck",
      "filter:anyOf",
      "filter:name",
      "filter:category:event",
      "remaining:bottomDeck",
    ]),
  );
});
