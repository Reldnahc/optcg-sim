import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses conditional play-from-hand rested with separated type-or-attribute filters", () => {
  expect(
    parseCardEffectLine(
      "[On Play] If you have 2 or less Characters, play up to 1 {Muggy Kingdom} type or <Slash> attribute Character card with a cost of 4 or less other than [Dracule Mihawk] from your hand rested.",
    ),
  ).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["character"] },
        op: "lte",
        value: 2,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                anyOf: [
                  { typesAny: ["Muggy Kingdom"] },
                  { attributesAny: ["slash"] },
                ],
                categories: ["character"],
                cost: { max: 4 },
                nameNot: ["Dracule Mihawk"],
              },
            },
          },
          {
            effect: {
              type: "playSelected",
              selection: "handSelection:play-from-hand",
              ignoreCost: true,
              enterRested: true,
            },
          },
        ],
      },
    },
  });
});
