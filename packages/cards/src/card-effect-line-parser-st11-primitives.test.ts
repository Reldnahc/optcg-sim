import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses reveal-top add-to-hand with bottom remainder under when-attacking", () => {
  const result = parseCardEffectLine(
    "[DON!! x1] [When Attacking] [Once Per Turn] Reveal 1 card from the top of your deck and add up to 1 {FILM} type card to your hand. Then, place the rest at the bottom of your deck.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "whenAttacking" },
      oncePerTurn: true,
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: 1,
      },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "revealTop",
              player: "self",
              zone: "deck",
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
              filter: { typesAny: ["FILM"] },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: { type: "moveSelected", to: "hand" },
          },
          {
            connector: "then",
            effect: {
              type: "placeSetRemainder",
              destination: "deck",
              position: "bottom",
              order: "original",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:whenAttacking",
      "marker:oncePerTurn",
      "marker:attachedDon",
      "condition:attachedDonCount",
      "instruction:revealTop",
      "instruction:selectFromSet",
      "filter:type",
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      "remaining:bottomDeck",
      "order:original",
    ]),
  );
});
