import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses trash-self plus filtered field-trash as a reusable cost sequence before DON ramp", () => {
  const result = parseCardEffectLine(
    '[Activate: Main] You may trash this Character and 1 of your Characters with a type including "Baroque Works": Add up to 1 DON!! card from your DON!! deck and set it as active.',
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
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
                  { type: "trashSelf" },
                  {
                    type: "trashFromField",
                    count: 1,
                    chooser: "self",
                    filter: {
                      categories: ["character"],
                      typesIncludeAny: ["Baroque Works"],
                    },
                  },
                ],
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "moveCards",
              min: 0,
              count: 1,
              from: { player: "self", zone: "donDeck", position: "top" },
              to: { player: "self", zone: "costArea" },
              order: "original",
              destinationState: "active",
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "sourcePresence:mustRemain",
      "composition:optionalCostedEffect",
      "composition:costSequence",
      "cost:trashSelf",
      "cost:trashFromField",
      "filter:type",
      "instruction:moveCards",
      "zone:donDeck",
      "destination:costArea",
      "state:active",
      "composition:entryExpression",
    ]),
  );
});
