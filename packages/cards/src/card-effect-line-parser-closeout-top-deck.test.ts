import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("closeout top-deck parser variants", () => {
  it("parses Look at up to N as the same top-deck search primitive", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at up to 5 cards from the top of your deck; reveal up to 1 red Character with a cost of 1 and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
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
                zone: "deck",
                count: 5,
                saveAs: "set:search-look",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:search-look",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  colorsAny: ["red"],
                  categories: ["character"],
                  cost: { op: "eq", value: 1 },
                },
                saveAs: "searchSelection:hand",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "revealSelected",
                selection: "searchSelection:hand",
                visibility: "bothPlayers",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "moveSelected",
                selection: "searchSelection:hand",
                from: "set:search-look",
                to: "hand",
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:search-look",
                owner: "self",
                destination: "deck",
                position: "bottom",
                order: "chooser",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "look:topDeck",
        "instruction:selectFromSet",
        "filter:color",
        "filter:category:character",
        "filter:cost",
        "instruction:placeSetRemainder",
      ]),
    );
  });

  it("parses reveal-top Character-card predicates with cleanup", () => {
    const result = parseCardEffectLine(
      "[When Attacking] Reveal 1 card from the top of your deck. If the revealed card is a Character card with 6000 power or more, this Character gains +3000 power during this turn. Then, place the revealed card at the bottom of your deck.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "whenAttacking" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "revealTop",
                player: "self",
                count: 1,
                saveAs: "set:revealed-top-conditional",
                visibility: "bothPlayers",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:revealed-top-conditional",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  power: { min: 6000 },
                },
                saveAs: "revealSelection:conditional",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "modifyPower",
                target: { type: "self" },
                value: 3000,
                duration: { type: "thisTurn" },
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:revealed-top-conditional",
                owner: "self",
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
        "instruction:revealTop",
        "filter:category:character",
        "filter:power",
        "instruction:modifyPower",
        "instruction:placeSetRemainder",
      ]),
    );
  });
});
