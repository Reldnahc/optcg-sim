import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses shorthand cost thresholds in KO targets before active DON movement", () => {
  const result = parseCardEffectLine(
    "[Main] K.O. up to 1 of your opponent's Characters with a cost 5 or less. Then, add up to 1 DON!! card from your DON!! deck and set it as active.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      filter: {
                        categories: ["character"],
                        cost: { max: 5 },
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "ko",
                    target: {
                      type: "savedFieldObject",
                      zone: "characterArea",
                      player: "opponent",
                    },
                  },
                },
              ],
            },
          },
          {
            effect: {
              type: "moveCards",
              from: { player: "self", zone: "donDeck", position: "top" },
              to: { player: "self", zone: "costArea" },
              destinationState: "active",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventMain",
      "instruction:ko",
      "filter:cost",
      "instruction:moveCards",
      "zone:donDeck",
      "destination:costArea",
      "state:active",
    ]),
  );
});
