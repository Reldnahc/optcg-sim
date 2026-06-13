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

it("parses opponent optional active DON movement from their DON deck", () => {
  const result = parseCardEffectLine(
    "[On Play] Your opponent may add 1 DON!! card from their DON!! deck and set it as active.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "moveCards",
        min: 0,
        count: 1,
        chooser: "opponent",
        from: { player: "opponent", zone: "donDeck", position: "top" },
        to: { player: "opponent", zone: "costArea" },
        order: "original",
        destinationState: "active",
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:moveCards",
      "player:opponent",
      "chooser:opponent",
      "zone:donDeck",
      "destination:costArea",
      "state:active",
      "filter:category:don",
    ]),
  );
});

it("parses opponent optional active DON movement after a reusable body", () => {
  const result = parseCardEffectLine(
    "[On Play] K.O. up to 1 of your opponent's Characters with a cost of 3 or less. Then, your opponent may add 1 DON!! card from their DON!! deck and set it as active.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          { connector: "always", effect: { type: "sequence" } },
          {
            connector: "then",
            effect: {
              type: "moveCards",
              min: 0,
              count: 1,
              chooser: "opponent",
              from: { player: "opponent", zone: "donDeck", position: "top" },
              to: { player: "opponent", zone: "costArea" },
              order: "original",
              destinationState: "active",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:ko",
      "instruction:moveCards",
      "player:opponent",
      "chooser:opponent",
      "zone:donDeck",
      "destination:costArea",
      "state:active",
      "expression:sequence",
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

it("parses DON deck movement before a comma-led top-deck search", () => {
  const result = parseCardEffectLine(
    "[On K.O.] Add up to 1 DON!! card from your DON!! deck and rest it, look at 5 cards from the top of your deck; reveal up to 1 {Donquixote Pirates} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onKO" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "moveCards",
              min: 0,
              count: 1,
              from: { player: "self", zone: "donDeck", position: "top" },
              to: { player: "self", zone: "costArea" },
              destinationState: "rested",
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: { type: "revealTop", count: 5 },
                },
                {
                  connector: "then",
                  effect: { type: "selectFromSet", max: 1 },
                },
                {
                  connector: "ifPreviousSucceeded",
                  effect: { type: "revealSelected" },
                },
                {
                  connector: "ifPreviousSucceeded",
                  effect: { type: "moveSelected", to: "hand" },
                },
                {
                  connector: "then",
                  effect: { type: "placeSetRemainder", destination: "deck" },
                },
              ],
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onKO",
      "connector:commaBeforeLook",
      "instruction:moveCards",
      "zone:donDeck",
      "state:rested",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
    ]),
  );
});
