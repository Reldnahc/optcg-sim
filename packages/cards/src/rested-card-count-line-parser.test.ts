import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses rested-card condition with draw-trash sequence and DON activation body", () => {
  const result = parseCardEffectLine(
    "[On Play] If you have 8 or more rested cards, draw 2 cards and trash 1 card from your hand. Then, set up to 1 of your DON!! cards as active.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { state: "rested" },
        op: "gte",
        value: 8,
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
                  connector: "always",
                  effect: { type: "draw", count: 2, player: "self" },
                },
                {
                  connector: "then",
                  effect: {
                    type: "trashFromHand",
                    count: 1,
                    player: "self",
                    chooser: "self",
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
                      zone: "costArea",
                      player: "self",
                      chooser: "self",
                      min: 0,
                      max: 1,
                      filter: { categories: ["don"], state: "rested" },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: { type: "activate" },
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
      "condition:fieldCount",
      "filter:state:rested",
      "instruction:draw",
      "instruction:trashFromHand",
      "instruction:activate",
      "composition:selectThenApply",
    ]),
  );
});
