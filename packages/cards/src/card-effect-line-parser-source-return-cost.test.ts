import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses returning this Character to owner hand as a source movement cost before an independent body", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may return this Character to the owner's hand: If your Leader has the {Kuja Pirates} type, place up to 1 of your opponent's Characters with a cost of 1 or less at the bottom of the owner's deck.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                optional: true,
                count: 1,
                from: {
                  player: "self",
                  zone: "characterArea",
                  source: "effectSource",
                },
                to: {
                  player: "self",
                  zone: "hand",
                },
              },
            },
          },
          {
            connector: "ifPreviousSucceeded",
            effect: {
              type: "conditional",
              if: {
                type: "hasCardInZone",
                zone: "leaderArea",
                player: "self",
                filter: {
                  categories: ["leader"],
                  typesAny: ["Kuja Pirates"],
                },
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    saveResultAs: "selected:owner-deck-bottom",
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "opponent",
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
                    connector: "then",
                    effect: {
                      type: "bounce",
                      destination: "deckBottom",
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "composition:optionalCostedEffect",
      "cost:returnToOwnerHand",
      "cost:moveCards",
      "target:thisCharacter",
      "zone:characterArea",
      "destination:ownerHand",
      "condition:leaderIdentity",
      "filter:type",
      "instruction:moveSelected",
      "destination:deck",
      "position:bottom",
    ]),
  );
});
