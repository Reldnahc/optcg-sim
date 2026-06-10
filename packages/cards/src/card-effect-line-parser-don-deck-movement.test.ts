import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses explicit rested DON movement from DON deck as a reusable move primitive", () => {
  const result = parseCardEffectLine(
    "[On Play] Add up to 2 DON!! cards from your DON!! deck and rest them.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "moveCards",
        min: 0,
        count: 2,
        from: { player: "self", zone: "donDeck", position: "top" },
        to: { player: "self", zone: "costArea" },
        order: "original",
        destinationState: "rested",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:moveCards",
      "zone:donDeck",
      "destination:costArea",
      "state:rested",
      "filter:category:don",
    ]),
  );
});

it("parses plural active DON movement from DON deck under another entry point", () => {
  const result = parseCardEffectLine(
    "[When Attacking] Add up to 2 DON!! cards from your DON!! deck and set them as active.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "whenAttacking" },
      effect: {
        type: "moveCards",
        min: 0,
        count: 2,
        from: { player: "self", zone: "donDeck", position: "top" },
        to: { player: "self", zone: "costArea" },
        order: "original",
        destinationState: "active",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:whenAttacking",
      "instruction:moveCards",
      "zone:donDeck",
      "destination:costArea",
      "state:active",
      "filter:category:don",
    ]),
  );
});

it("parses active DON movement followed by singular additional rested DON movement", () => {
  const result = parseCardEffectLine(
    "[On Play] Add up to 1 DON!! card from your DON!! deck and set it as active, and add up to 1 additional DON!! card and rest it.",
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
              type: "moveCards",
              count: 1,
              destinationState: "active",
            },
          },
          {
            connector: "then",
            effect: {
              type: "moveCards",
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
      "instruction:moveCards",
      "state:active",
      "state:rested",
      "expression:sequence",
    ]),
  );
});
