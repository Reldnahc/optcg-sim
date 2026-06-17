import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses rest-self plus filtered field-to-deck-bottom cost before a reusable body", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may rest this card and place 1 of your Characters with 1000 base power at the bottom of your deck: Draw 1 card.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: {
                type: "sequence",
                optional: true,
                costs: [
                  { type: "restSelf" },
                  {
                    type: "moveCards",
                    count: 1,
                    chooser: "self",
                    from: { player: "self", zone: "characterArea" },
                    to: { player: "self", zone: "deck", position: "bottom" },
                    filter: {
                      categories: ["character"],
                      power: { op: "eq", value: 1000 },
                    },
                  },
                ],
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: { type: "draw", count: 1 },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:restSelf",
      "target:thisCard",
      "cost:moveCards",
      "zone:characterArea",
      "destination:deck",
      "position:bottom",
      "filter:category:character",
      "filter:power",
      "instruction:draw",
    ]),
  );
});
