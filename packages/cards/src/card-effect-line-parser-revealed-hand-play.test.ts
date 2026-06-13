import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses revealed hand cards into first and remaining play-selected choices", () => {
  const result = parseCardEffectLine(
    "[On Play] Reveal up to 2 {Dressrosa} type Character cards with a cost of 7 or less other than [Rebecca] from your hand. Play 1 of the revealed cards and play the other card rested if it has a cost of 4 or less.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 2,
              visibility: "bothPlayers",
              filter: {
                categories: ["character"],
                typesAny: ["Dressrosa"],
                cost: { max: 7 },
                nameNot: ["Rebecca"],
              },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "selectFromSet",
              min: 1,
              max: 1,
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: { type: "playSelected", ignoreCost: true },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "selectFromSet",
              min: 0,
              max: 1,
              filter: { cost: { max: 4 } },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "playSelected",
              enterRested: true,
              ignoreCost: true,
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "instruction:selectCards",
      "instruction:selectFromSet",
      "instruction:playSelected",
      "state:rested",
      "zone:hand",
      "reveal:bothPlayers",
      "cardinality:upTo",
      "filter:type",
      "filter:cost",
      "filter:nameNot",
    ]),
  );
});
