import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses conditional rest followed by delayed active DON ramp", () => {
  const result = parseCardEffectLine(
    "[On Play] If you have any DON!! cards given, rest up to 1 of your opponent's Characters with a cost of 5 or less. Then, add up to 1 DON!! card from your DON!! deck and set it as active at the end of this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["don"], state: "attached" },
        op: "gte",
        value: 1,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      max: 1,
                      filter: {
                        categories: ["character"],
                        cost: { max: 5 },
                      },
                    },
                  },
                },
                { effect: { type: "rest" } },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "delayed",
              timing: { type: "endOfTurn", turn: "current" },
              effect: {
                type: "moveCards",
                min: 0,
                count: 1,
                from: { player: "self", zone: "donDeck", position: "top" },
                to: { player: "self", zone: "costArea" },
                destinationState: "active",
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "condition:donFieldCount",
      "filter:state:attached",
      "instruction:rest",
      "target:opponentCharacters",
      "instruction:moveCards",
      "zone:donDeck",
      "destination:costArea",
      "state:active",
      "duration:endOfTurn",
      "composition:delayed",
    ]),
  );
});
