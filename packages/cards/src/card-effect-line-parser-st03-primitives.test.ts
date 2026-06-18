import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses top-deck look return top-or-bottom placement", () => {
  const result = parseCardEffectLine(
    "[On Play] Look at 3 cards from the top of your deck and return them to the top or bottom of the deck in any order.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "placeTopDeckCards",
        player: "self",
        count: 3,
        destination: "topOrBottom",
        order: "ownerChoice",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:placeTopDeckCards",
      "look:topDeck",
      "zone:deck",
      "position:top",
      "position:bottom",
      "order:anyOrder",
    ]),
  );
});
