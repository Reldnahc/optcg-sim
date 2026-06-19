import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses cost reduction, deck trash, and own-field K.O. as independent body primitives", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] Give up to 1 of your opponent's Characters -4 cost during this turn and trash 2 cards from the top of your deck. Then, K.O. 1 of your {Dressrosa} type Characters.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "modifyCost",
                    target: {
                      type: "choose",
                      request: {
                        player: "opponent",
                        zone: "characterArea",
                        min: 0,
                        max: 1,
                        filter: { categories: ["character"] },
                      },
                    },
                    value: -4,
                    duration: { type: "thisTurn" },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "moveCards",
                    count: 2,
                    from: { player: "self", zone: "deck", position: "top" },
                    to: { player: "self", zone: "trash" },
                    order: "original",
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "self",
                      zone: "characterArea",
                      min: 1,
                      max: 1,
                      allowFewerIfUnavailable: false,
                      filter: {
                        categories: ["character"],
                        typesAny: ["Dressrosa"],
                      },
                    },
                  },
                },
                { connector: "then", effect: { type: "ko" } },
              ],
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "marker:oncePerTurn",
      "expression:sequence",
      "instruction:modifyCost",
      "target:opponentCharacters",
      "instruction:moveCards",
      "zone:deck",
      "destination:trash",
      "instruction:ko",
      "player:self",
      "filter:type",
      "composition:entryExpression",
    ]),
  );
});
