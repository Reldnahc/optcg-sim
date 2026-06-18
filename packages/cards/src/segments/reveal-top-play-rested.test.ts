import { describe, expect, it } from "vitest";

import { revealTopPlayRestedExpressionParser } from "./reveal-top-play-rested.js";

describe("reveal top play rested expression parser", () => {
  it("parses reveal top play rested with bottom cleanup as reusable reveal/select/play primitives", () => {
    const result = revealTopPlayRestedExpressionParser({
      text: "Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea} type Character card with a cost of 4 or less, you may play that card rested. Then, place the rest at the bottom of your deck.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          { effect: { type: "revealTop", player: "self", count: 1 } },
          {
            effect: {
              type: "selectFromSet",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                typesAny: ["The Seven Warlords of the Sea"],
                cost: { max: 4 },
              },
            },
          },
          {
            effect: {
              type: "playSelected",
              enterRested: true,
              ignoreCost: true,
            },
          },
          {
            effect: {
              type: "placeSetRemainder",
              destination: "deck",
              position: "bottom",
              order: "original",
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:playSelected",
        "instruction:placeSetRemainder",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "state:rested",
        "destination:deck",
        "position:bottom",
      ]),
    );
  });
});
