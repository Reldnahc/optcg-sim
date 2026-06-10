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

it("parses leader type alternatives before DON activation under End of Your Turn", () => {
  const result = parseCardEffectLine(
    "[End of Your Turn] If your Leader has the {FILM} or {Straw Hat Crew} type, set up to 2 of your DON!! cards as active.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "endOfYourTurn" },
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
          typesAny: ["FILM", "Straw Hat Crew"],
        },
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zone: "costArea",
                max: 2,
              },
            },
          },
          {
            connector: "then",
            effect: { type: "activate" },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:endOfYourTurn",
      "condition:leaderIdentity",
      "filter:category:leader",
      "filter:type",
      "instruction:activate",
      "target:yourDonCards",
      "composition:entryExpression",
    ]),
  );
});

it("parses leader type-or-attribute alternatives before DON activation under On Play", () => {
  const result = parseCardEffectLine(
    "[On Play] If your Leader has the {FILM} type or the <Strike> attribute, set up to 1 of your DON!! cards as active.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
          anyOf: [{ typesAny: ["FILM"] }, { attributesAny: ["strike"] }],
        },
      },
      effect: {
        type: "sequence",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "condition:leaderIdentity",
      "filter:anyOf",
      "filter:type",
      "filter:attribute",
      "instruction:activate",
      "target:yourDonCards",
      "composition:entryExpression",
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
