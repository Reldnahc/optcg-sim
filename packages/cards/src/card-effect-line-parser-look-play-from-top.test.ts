import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser looked top-deck play effects", () => {
  it("parses top-of-deck looked-set play as decomposed play primitives", () => {
    const result = parseCardEffectLine(
      "[Counter] Look at 5 cards from the top of your deck and play up to 1 {Animal} type Character card with a cost of 3 or less. Then, place the rest at the bottom of your deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
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
                saveAs: "set:look-play",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:look-play",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  typesAny: ["Animal"],
                  cost: { max: 3 },
                },
                saveAs: "revealSelection:play",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "playSelected",
                selection: "revealSelection:play",
                ignoreCost: true,
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:look-play",
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
        "entry:eventCounter",
        "look:topDeck",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:playSelected",
        "instruction:placeSetRemainder",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "remaining:bottomDeck",
      ]),
    );
  });

  it("parses top-of-deck looked-set rested play as the same play primitive with entry state", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 5 cards from the top of your deck and play up to 1 {Animal} type Character card with 4000 power or less rested. Then, place the rest at the bottom of your deck in any order.",
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
                type: "revealTop",
                player: "self",
                zone: "deck",
                count: 5,
                saveAs: "set:look-play",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:look-play",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  typesAny: ["Animal"],
                  power: { max: 4000 },
                },
                saveAs: "revealSelection:play",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "playSelected",
                selection: "revealSelection:play",
                ignoreCost: true,
                enterRested: true,
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:look-play",
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
        "entry:onPlay",
        "look:topDeck",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:playSelected",
        "state:rested",
        "instruction:placeSetRemainder",
        "filter:type",
        "filter:category:character",
        "filter:power",
        "remaining:bottomDeck",
      ]),
    );
  });
});
