import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("looked top-deck play with trash remainder parser", () => {
  it("parses looked top-deck play with trash remainder", () => {
    const result = parseCardEffectLine(
      '[On Play] Look at 3 cards from the top of your deck and play up to 1 Character card with a type including "CP" other than [Stussy] and a cost of 2 or less. Then, trash the rest.',
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "revealTop", count: 3 } },
            {
              effect: {
                type: "selectFromSet",
                filter: {
                  categories: ["character"],
                  typesIncludeAny: ["CP"],
                  nameNot: ["Stussy"],
                  cost: { max: 2 },
                },
              },
            },
            { effect: { type: "playSelected", ignoreCost: true } },
            {
              effect: {
                type: "placeSetRemainder",
                destination: "trash",
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
        "instruction:playSelected",
        "filter:category:character",
        "filter:type",
        "filter:nameNot",
        "filter:cost",
        "instruction:placeSetRemainder",
        "remaining:trash",
      ]),
    );
  });

  it("parses conditional looked top-deck play with trash remainder", () => {
    const result = parseCardEffectLine(
      '[Main] If your Leader\'s type includes "CP", look at 5 cards from the top of your deck; play up to 1 Character card with a type including "CP" and a cost of 5 or less. Then, trash the rest.',
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: { typesIncludeAny: ["CP"] },
        },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "revealTop", count: 5 } },
            {
              effect: {
                type: "selectFromSet",
                filter: {
                  categories: ["character"],
                  typesIncludeAny: ["CP"],
                  cost: { max: 5 },
                },
              },
            },
            { effect: { type: "playSelected", ignoreCost: true } },
            {
              effect: {
                type: "placeSetRemainder",
                destination: "trash",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventMain",
        "condition:leaderIdentity",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:playSelected",
        "instruction:placeSetRemainder",
        "remaining:trash",
      ]),
    );
  });
});
