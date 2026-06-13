import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses activated start-of-turn timing as a reusable entry primitive", () => {
  const result = parseCardEffectLine(
    "This effect can be activated at the start of your turn. If you have 8 or more DON!! cards on your field, look at 5 cards from the top of your deck; reveal up to 1 {Straw Hat Crew} type card and add it to your hand. Then, place the rest at the top or bottom of the deck in any order.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "startOfYourTurn" },
      sourcePresencePolicy: "mustRemainInSameZone",
      condition: {
        type: "fieldCount",
        player: "self",
        op: "gte",
        value: 8,
        filter: { categories: ["don"] },
      },
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "revealTop", count: 5 } },
          {
            effect: {
              type: "selectFromSet",
              max: 1,
              filter: { typesAny: ["Straw Hat Crew"] },
            },
          },
          { effect: { type: "revealSelected", visibility: "bothPlayers" } },
          { effect: { type: "moveSelected", to: "hand" } },
          {
            effect: {
              type: "placeSetRemainder",
              destination: "deck",
              position: "topOrBottom",
              order: "chooser",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:startOfYourTurn",
      "sourcePresence:mustRemain",
      "condition:donFieldCount",
      "look:topDeck",
      "instruction:revealSelected",
      "remaining:bottomDeck",
      "order:anyOrder",
    ]),
  );
});
