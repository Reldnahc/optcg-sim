import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses DON-return On K.O. deck play and shuffle as reusable sequence primitives", () => {
  const result = parseCardEffectLine(
    "[Opponent's Turn] [On K.O.] DON!! −1 (You may return the specified number of DON!! cards from your field to your DON!! deck.): Play up to 1 [Baron Tamago] with a cost of 4 or less from your deck. Then, shuffle your deck.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onKO" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: { type: "returnDon", count: 1, optional: true },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "deck",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: {
                      names: ["Baron Tamago"],
                      cost: { max: 4 },
                    },
                    visibility: "chooserOnly",
                  },
                },
                {
                  effect: {
                    type: "playSelected",
                    ignoreCost: true,
                  },
                },
                {
                  connector: "then",
                  effect: { type: "shuffleDeck", player: "self" },
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
      "entry:opponentTurn",
      "condition:opponentTurn",
      "entry:onKO",
      "cost:returnDon",
      "instruction:selectCards",
      "instruction:playSelected",
      "instruction:shuffleDeck",
      "zone:deck",
      "filter:name",
      "filter:cost",
    ]),
  );
});
