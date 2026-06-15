import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses hand-to-life followed by conditional top-or-bottom Life to hand", () => {
  const parsed = parseCardEffectLine(
    "[On Play] Add up to 1 {Revolutionary Army} type Character card from your hand to the top of your Life cards face-up. Then, if you have 2 or more Life cards, add 1 card from the top or bottom of your Life cards to your hand.",
  );

  expect(parsed).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          { connector: "always", effect: { type: "sequence" } },
          {
            connector: "then",
            effect: {
              type: "conditional",
              then: {
                type: "choice",
                chooser: "self",
                min: 1,
                max: 1,
                options: [
                  {
                    id: "life-to-hand:top",
                    effect: {
                      type: "moveCards",
                      count: 1,
                      from: {
                        player: "self",
                        zone: "life",
                        position: "top",
                      },
                      to: { player: "self", zone: "hand" },
                      order: "original",
                    },
                  },
                  {
                    id: "life-to-hand:bottom",
                    effect: {
                      type: "moveCards",
                      count: 1,
                      from: {
                        player: "self",
                        zone: "life",
                        position: "bottom",
                      },
                      to: { player: "self", zone: "hand" },
                      order: "original",
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    },
  });
  expect(parsed?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:selectCards",
      "instruction:moveSelected",
      "destination:life",
      "visibility:faceUp",
      "connector:then",
      "expression:conditional",
      "condition:lifeCount",
      "instruction:moveCards",
      "zone:life",
      "position:top",
      "position:bottom",
      "destination:hand",
      "composition:chooseOne",
      "composition:entryExpression",
    ]),
  );
});
