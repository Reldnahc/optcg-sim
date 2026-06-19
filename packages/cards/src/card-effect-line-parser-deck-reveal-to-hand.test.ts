import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses whole-deck reveal to hand and shuffle as reusable selected-card primitives", () => {
  const result = parseCardEffectLine(
    "[On Play] Reveal up to 1 [Artificial Devil Fruit SMILE] from your deck and add it to your hand. Then, shuffle your deck.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectCards",
              zone: "deck",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: { names: ["Artificial Devil Fruit SMILE"] },
              visibility: "chooserOnly",
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "revealSelected",
              visibility: "bothPlayers",
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "moveSelected",
              from: "deck",
              to: "hand",
            },
          },
          {
            connector: "then",
            effect: { type: "shuffleDeck", player: "self" },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:selectCards",
      "instruction:revealSelected",
      "instruction:moveSelected",
      "instruction:shuffleDeck",
      "zone:deck",
      "filter:name",
      "reveal:bothPlayers",
    ]),
  );
});
