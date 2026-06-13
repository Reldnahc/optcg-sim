import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses return-or-deck-bottom as one selection feeding a body choice", () => {
  const result = parseCardEffectLine(
    "[When Attacking] You may trash 1 {Firetank Pirates} type card from your hand: Return up to 1 Character with a cost of 1 or less to the owner's hand or place it at the bottom of their deck.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "whenAttacking" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: {
                type: "trashFromHand",
                count: 1,
                filter: { typesAny: ["Firetank Pirates"] },
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "anyPlayer",
                      zone: "characterArea",
                      min: 0,
                      max: 1,
                      filter: {
                        categories: ["character"],
                        cost: { max: 1 },
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "choice",
                    chooser: "self",
                    min: 1,
                    max: 1,
                    options: [
                      {
                        id: "selected:return-to-owner-hand",
                        effect: {
                          type: "bounce",
                          destination: "hand",
                        },
                      },
                      {
                        id: "selected:owner-deck-bottom",
                        effect: {
                          type: "bounce",
                          destination: "deckBottom",
                        },
                      },
                    ],
                  },
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
      "cost:trashFromHand",
      "instruction:returnToOwnerHand",
      "instruction:moveSelected",
      "destination:ownerHand",
      "destination:deck",
      "position:bottom",
      "expression:choice",
      "composition:selectThenApply",
    ]),
  );
});
