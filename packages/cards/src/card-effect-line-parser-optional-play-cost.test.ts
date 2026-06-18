import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses optional exact play-from-hand cost before field-to-Life placement", () => {
  const result = parseCardEffectLine(
    "[On Play] You may play 1 [Kotori] from your hand: Add up to 1 of your opponent's Characters with a cost of 3 or less to the top or bottom of your opponent's Life cards face-up.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            id: "cost:play-from-hand",
            connector: "always",
            optional: true,
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "hand",
                    player: "self",
                    chooser: "self",
                    min: 1,
                    max: 1,
                    filter: { names: ["Kotori"] },
                  },
                },
                {
                  effect: {
                    type: "playSelected",
                    selection: "handSelection:play-from-hand",
                    ignoreCost: true,
                  },
                },
              ],
            },
          },
          {
            id: "body:after-play-cost",
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      min: 0,
                      max: 1,
                      filter: {
                        categories: ["character"],
                        cost: { max: 3 },
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "choice",
                    options: [
                      { effect: { type: "bounce", destination: "lifeTop" } },
                      {
                        effect: {
                          type: "bounce",
                          destination: "lifeBottom",
                        },
                      },
                    ],
                  },
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
      "entry:onPlay",
      "composition:optionalCostedEffect",
      "instruction:playSelected",
      "cardinality:exact",
      "zone:hand",
      "filter:name",
      "instruction:moveSelected",
      "destination:life",
      "destination:faceUp",
      "composition:selectThenPlay",
      "composition:selectThenApply",
    ]),
  );
});

it("parses optional play-from-hand cost with another entry point and body", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may play 1 [Sabo] from your hand: Draw 1 card.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            optional: true,
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    filter: { names: ["Sabo"] },
                    min: 1,
                    max: 1,
                  },
                },
                {
                  effect: {
                    type: "playSelected",
                    selection: "handSelection:play-from-hand",
                    ignoreCost: true,
                  },
                },
              ],
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", count: 1, player: "self" },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "composition:optionalCostedEffect",
      "instruction:playSelected",
      "instruction:draw",
    ]),
  );
});
