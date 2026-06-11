import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses revealed-card condition into reveal, set selection, and DON movement primitives", () => {
  const result = parseCardEffectLine(
    "[On Play] Reveal 1 card from the top of your deck. If the revealed card has a cost of 2 or less, add up to 1 DON!! card from your DON!! deck and rest it.",
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
              type: "revealTop",
              player: "self",
              count: 1,
              visibility: "bothPlayers",
            },
          },
          {
            connector: "then",
            effect: {
              type: "selectFromSet",
              chooser: "self",
              min: 0,
              max: 1,
              filter: { cost: { max: 2 } },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "moveCards",
              min: 0,
              count: 1,
              from: { player: "self", zone: "donDeck", position: "top" },
              to: { player: "self", zone: "costArea" },
              destinationState: "rested",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "filter:cost",
      "connector:ifPreviousSucceeded",
      "instruction:moveCards",
      "zone:donDeck",
      "state:rested",
    ]),
  );
});

it("reuses revealed-card condition with another supported body primitive", () => {
  const result = parseCardEffectLine(
    "[On Play] Reveal 1 card from the top of your deck. If that card has a cost of 3 or less, draw 1 card.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          { connector: "always", effect: { type: "revealTop" } },
          {
            connector: "then",
            effect: {
              type: "selectFromSet",
              filter: { cost: { max: 3 } },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: { type: "draw", player: "self", count: 1 },
          },
        ],
      },
    },
  });
});
