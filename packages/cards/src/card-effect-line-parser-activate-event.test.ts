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

  it("parses conditional costed trash Event activation as reusable selection plus activation", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [On Play] DON!! −1: If your Leader is [Sanji], activate the [Main] effect of up to 1 Event card with a cost of 7 or less in your trash.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        condition: { type: "yourTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: { type: "returnDon", count: 1 },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "conditional",
                if: {
                  type: "hasCardInZone",
                  zone: "leaderArea",
                  player: "self",
                  filter: { names: ["Sanji"] },
                },
                then: {
                  type: "sequence",
                  effects: [
                    {
                      effect: {
                        type: "selectCards",
                        zone: "trash",
                        player: "self",
                        chooser: "self",
                        min: 0,
                        max: 1,
                        filter: {
                          categories: ["event"],
                          cost: { max: 7 },
                        },
                        saveAs: "trashSelection:activate-event",
                        visibility: "bothPlayers",
                      },
                    },
                    {
                      effect: {
                        type: "activateSelectedEvent",
                        selection: "trashSelection:activate-event",
                        sourceZone: "trash",
                        trigger: { type: "main" },
                        ignoreCost: true,
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
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:yourTurn",
        "cost:returnDon",
        "condition:leaderIdentity",
        "zone:trash",
        "instruction:activateSelectedEvent",
        "reference:eventMain",
      ]),
    );
  });

  it("parses explicit referenced Event entry points without treating Main as the only supported reference", () => {
    const result = parseCardEffectLine(
      "[On Play] activate the [Counter] effect of up to 1 Event card with a cost of 2 or less from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
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
                  cost: { max: 2 },
                },
                saveAs: "handSelection:activate-event",
                visibility: "chooserOnly",
              },
            },
            {
              effect: {
                type: "activateSelectedEvent",
                selection: "handSelection:activate-event",
                trigger: { type: "counter" },
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
        "instruction:activateSelectedEvent",
        "reference:effectEntryPoint",
        "composition:selectThenActivate",
      ]),
    );
    expect(result?.evidence).not.toContain("reference:eventMain");
  });
});
