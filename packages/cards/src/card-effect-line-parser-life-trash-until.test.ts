import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses trash top Life until threshold as dynamic life-to-trash movement after K.O.", () => {
  const result = parseCardEffectLine(
    "[Main] K.O. up to 1 of your opponent's Characters. Then, trash cards from the top of your Life cards until you have 1 Life card.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "main" },
      effect: {
        type: "sequence",
        effects: [
          { connector: "always", effect: { type: "sequence" } },
          {
            connector: "then",
            effect: {
              type: "moveCards",
              count: {
                type: "countMatchingZoneCards",
                player: "self",
                zone: "life",
                per: 1,
                multiplier: 1,
                offset: -1,
                minimum: 0,
              },
              from: { player: "self", zone: "life", position: "top" },
              to: { player: "self", zone: "trash" },
              order: "original",
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
      "instruction:moveCards",
      "valueSource:lifeCount:self",
      "valueTransform:offset",
      "valueTransform:minimum",
      "zone:life",
      "destination:trash",
    ]),
  );
});

it("parses trash top Life until threshold after hand-or-trash play", () => {
  const result = parseCardEffectLine(
    "[Main] Play up to 1 [Enel] with a cost of 7 or less from your hand or trash. Then, trash cards from the top of your Life cards until you have 1 Life card.",
  );

  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:eventMain",
      "instruction:playSelected",
      "instruction:moveCards",
      "valueSource:lifeCount:self",
      "valueTransform:offset",
      "valueTransform:minimum",
      "zone:life",
      "destination:trash",
    ]),
  );
});
