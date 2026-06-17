import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses optional hand-trash cost into only-matching Characters KO condition", () => {
  const result = parseCardEffectLine(
    "[On Play] You may trash 1 card from your hand: If you only have {Celestial Dragons} type Characters, K.O. up to 2 of your opponent's Characters with a base cost of 3 or less.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost:trashFromHand",
            effect: {
              type: "payCost",
              cost: {
                type: "trashFromHand",
                count: 1,
                chooser: "self",
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                type: "onlyMatchingFieldCards",
                zone: "characterArea",
                player: "self",
                filter: {
                  categories: ["character"],
                  typesAny: ["Celestial Dragons"],
                },
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "opponent",
                        zone: "characterArea",
                        max: 2,
                        filter: {
                          categories: ["character"],
                          baseCost: { max: 3 },
                        },
                      },
                    },
                  },
                  { effect: { type: "ko" } },
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
      "entry:onPlay",
      "composition:optionalCostedEffect",
      "cost:trashFromHand",
      "condition:onlyMatchingFieldCards",
      "instruction:ko",
      "cardinality:upTo",
      "filter:type",
      "filter:cost",
      "composition:selectThenApply",
    ]),
  );
});

it("parses attached DON, optional return-to-hand, and dependent opponent hand play", () => {
  const result = parseCardEffectLine(
    "[On Play] Give up to 1 rested DON!! card to your Leader. Then, you may return up to 1 of your opponent's Characters with a cost of 5 or less to the owner's hand. If you do, your opponent plays up to 1 Character card with a cost of 4 or less from their hand.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy: "mustRemainInSameZone",
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
                  saveResultAs: "donSelection:attach",
                  effect: {
                    type: "selectCards",
                    zone: "costArea",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 1,
                    filter: {
                      categories: ["don"],
                      state: "rested",
                    },
                    saveAs: "donSelection:attach",
                    visibility: "bothPlayers",
                  },
                },
                {
                  connector: "ifYouDo",
                  saveResultAs: "targetSelection:attach-don",
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "self",
                      zones: ["leaderArea", "characterArea"],
                      min: 1,
                      max: 1,
                      filter: { categories: ["leader"] },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: { type: "attachSelectedDon" },
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
                  optional: true,
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
                              cost: { max: 5 },
                            },
                          },
                        },
                      },
                      { effect: { type: "bounce", destination: "hand" } },
                    ],
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
                          zone: "hand",
                          player: "opponent",
                          chooser: "opponent",
                          min: 0,
                          max: 1,
                          filter: {
                            categories: ["character"],
                            cost: { max: 4 },
                          },
                        },
                      },
                      {
                        effect: {
                          type: "playSelected",
                          selection: "handSelection:play-from-hand",
                          ignoreCost: true,
                          player: "opponent",
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
      "instruction:attachDon",
      "instruction:returnToOwnerHand",
      "instruction:playSelected",
      "composition:optionalActionEffect",
      "composition:selectThenApply",
      "composition:selectThenPlay",
      "player:opponent",
      "chooser:opponent",
    ]),
  );
});
