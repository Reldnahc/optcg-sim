import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("looked top-deck trash selection parser", () => {
  it("parses looked top-deck trash selection with bottom remainder", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 5 cards from the top of your deck and trash up to 2 cards. Then, place the rest at the bottom of your deck in any order.",
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
                saveAs: "set:look-trash",
                visibility: "chooserOnly",
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectFromSet",
                set: "set:look-trash",
                chooser: "self",
                min: 0,
                max: 2,
                saveAs: "revealSelection:trash",
              },
            },
            {
              connector: "ifPreviousSucceeded",
              effect: {
                type: "moveSelected",
                selection: "revealSelection:trash",
                from: "set:look-trash",
                to: "trash",
              },
            },
            {
              connector: "then",
              effect: {
                type: "placeSetRemainder",
                set: "set:look-trash",
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
        "instruction:revealTop",
        "instruction:selectFromSet",
        "cardinality:upTo",
        "instruction:moveSelected",
        "destination:trash",
        "instruction:placeSetRemainder",
        "remaining:bottomDeck",
        "order:anyOrder",
      ]),
    );
  });
});
