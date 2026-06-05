import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("selected Event activation parsing", () => {
  it("parses conditional On Play hand Event activation as reusable selection plus activation", () => {
    const result = parseCardEffectLine(
      "[On Play] If your Leader has the {Dressrosa} type, activate up to 1 {Dressrosa} type Event from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: { categories: ["leader"], typesAny: ["Dressrosa"] },
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
                  categories: ["event"],
                  typesAny: ["Dressrosa"],
                },
                saveAs: "handSelection:activate-event",
                visibility: "chooserOnly",
              },
            },
            {
              effect: {
                type: "activateSelectedEvent",
                selection: "handSelection:activate-event",
                trigger: { type: "main" },
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
        "condition:leaderIdentity",
        "filter:type",
        "filter:category:event",
        "instruction:activateSelectedEvent",
        "composition:selectThenActivate",
        "reference:eventMain",
      ]),
    );
  });
});
