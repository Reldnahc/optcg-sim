import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("mixed target card effect parser", () => {
  it("parses shared-total opponent Character or DON rest followed by life-to-hand movement", () => {
    const result = parseCardEffectLine(
      "[On Play] Rest up to a total of 2 of your opponent's Characters or DON!! cards. Then, add 1 card from the top of your Life cards to your hand.",
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
                type: "rest",
                target: {
                  type: "chooseFromZones",
                  request: {
                    player: "opponent",
                    zones: ["characterArea", "costArea"],
                    filter: { categories: ["character", "don"] },
                    min: 0,
                    max: 2,
                  },
                },
              },
            },
            {
              connector: "then",
              effect: {
                type: "moveCards",
                count: 1,
                from: { player: "self", zone: "life", position: "top" },
                to: { player: "self", zone: "hand" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:rest",
        "target:opponentCharactersOrDonCards",
        "zone:characterArea",
        "zone:costArea",
        "filter:category:character",
        "filter:category:don",
        "instruction:moveCards",
        "zone:life",
        "position:top",
        "destination:hand",
        "composition:entryExpression",
      ]),
    );
  });
});
