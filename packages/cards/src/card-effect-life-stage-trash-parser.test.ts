import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("life-gated Stage play from trash parser", () => {
  it("parses On Play life-count conditional Stage play from trash compositionally", () => {
    const result = parseCardEffectLine(
      "[On Play] If you have 3 or less Life cards, play up to 1 {Mary Geoise} type Stage card with a cost of 1 from your trash.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        condition: {
          type: "lifeCount",
          player: "self",
          op: "lte",
          value: 3,
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "trashSelection:play",
              effect: {
                type: "selectCards",
                zone: "trash",
                player: "self",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  categories: ["stage"],
                  typesAny: ["Mary Geoise"],
                  cost: { op: "eq", value: 1 },
                },
              },
            },
            {
              connector: "ifPossible",
              effect: {
                type: "playSelected",
                selection: "trashSelection:play",
                ignoreCost: true,
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "expression:conditional",
        "condition:lifeCount",
        "condition:comparator:lte",
        "instruction:playSelected",
        "zone:trash",
        "filter:type",
        "filter:category:stage",
        "filter:cost",
        "condition:comparator:eq",
        "composition:selectThenPlay",
      ]),
    );
  });
});
