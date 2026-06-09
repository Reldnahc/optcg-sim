import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

const expectPublicBottomSearchSequence = (
  result: ReturnType<typeof parseCardEffectLine>,
  lookCount: number,
  filter: object,
): void => {
  expect(result).toMatchObject({
    block: {
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "revealTop",
              count: lookCount,
              visibility: "chooserOnly",
            },
          },
          {
            effect: {
              type: "selectFromSet",
              filter,
            },
          },
          { effect: { type: "revealSelected", visibility: "bothPlayers" } },
          { effect: { type: "moveSelected", to: "hand" } },
          { effect: { type: "placeSetRemainder", position: "bottom" } },
        ],
      },
    },
  });
};

it("parses top-deck search with exact-name-or-event filter as reusable OR predicates", () => {
  const result = parseCardEffectLine(
    "[On Play] Look at 4 cards from the top of your deck; reveal up to 1 [Sanji] or Event card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
  );

  expectPublicBottomSearchSequence(result, 4, {
    anyOf: [{ names: ["Sanji"] }, { categories: ["event"] }],
  });
  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:revealSelected",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      "look:topDeck",
      "filter:anyOf",
      "filter:name",
      "filter:category:event",
      "remaining:bottomDeck",
    ]),
  );
});

it("parses top-deck search with multi-type filter and minimum cost predicate", () => {
  const result = parseCardEffectLine(
    "[On Play] Look at 4 cards from the top of your deck; reveal up to 1 {Alabasta} or {Straw Hat Crew} type card with a cost of 2 or more and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
  );

  expectPublicBottomSearchSequence(result, 4, {
    typesAny: ["Alabasta", "Straw Hat Crew"],
    cost: { min: 2 },
  });
  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:revealSelected",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      "look:topDeck",
      "filter:type",
      "filter:cost",
      "condition:comparator:gte",
      "remaining:bottomDeck",
    ]),
  );
});

it("parses leader attribute condition with attribute-card or color-event search filters", () => {
  const result = parseCardEffectLine(
    "[On Play] If your Leader has the <Slash> attribute, look at 5 cards from the top of your deck; reveal up to 1 <Slash> attribute card or green Event and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
  );

  expectPublicBottomSearchSequence(result, 5, {
    anyOf: [
      { attributesAny: ["slash"] },
      { colorsAny: ["green"], categories: ["event"] },
    ],
  });
  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
          attributesAny: ["slash"],
        },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "condition:leaderIdentity",
      "zone:leaderArea",
      "filter:category:leader",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "instruction:revealSelected",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      "look:topDeck",
      "filter:anyOf",
      "filter:attribute",
      "filter:color",
      "filter:category:event",
      "remaining:bottomDeck",
    ]),
  );
});
