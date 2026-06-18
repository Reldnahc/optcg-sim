import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses DON return cost into arbitrary opponent Life select-then-trash", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] DON!! -7 (You may return the specified number of DON!! cards from your field to your DON!! deck.): Trash up to 1 of your opponent's Life cards.",
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
            effect: {
              type: "payCost",
              cost: {
                type: "returnDon",
                count: 7,
                optional: true,
              },
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
                    zone: "life",
                    player: "opponent",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    saveAs: "lifeSelection:opponent-life-to-trash",
                    visibility: "chooserOnly",
                  },
                },
                {
                  effect: {
                    type: "moveSelected",
                    selection: "lifeSelection:opponent-life-to-trash",
                    from: "life",
                    to: "trash",
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
      "entry:activateMain",
      "marker:oncePerTurn",
      "cost:returnDon",
      "instruction:selectCards",
      "instruction:moveSelected",
      "zone:life",
      "destination:trash",
      "composition:selectThenMove",
    ]),
  );
});
