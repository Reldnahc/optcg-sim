import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses counter return-DON cost with split opponent Leader and Character power reduction", () => {
  const result = parseCardEffectLine(
    "[Counter] DON!! −1 (You may return the specified number of DON!! cards from your field to your DON!! deck.): Give up to 1 each of your opponent's Leader and Character cards −2000 power during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "counter" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: { type: "returnDon", count: 1, optional: true },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "sequence",
                    effects: [
                      {
                        saveResultAs: "selected:modify-power-leader-target",
                        effect: {
                          type: "selectTargets",
                          request: {
                            player: "opponent",
                            zones: ["leaderArea"],
                            min: 0,
                            max: 1,
                            filter: { categories: ["leader"] },
                          },
                        },
                      },
                      {
                        effect: {
                          type: "modifyPower",
                          value: -2000,
                          duration: { type: "thisTurn" },
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
                        saveResultAs: "selected:modify-power-character-target",
                        effect: {
                          type: "selectTargets",
                          request: {
                            player: "opponent",
                            zones: ["characterArea"],
                            min: 0,
                            max: 1,
                            filter: { categories: ["character"] },
                          },
                        },
                      },
                      {
                        effect: {
                          type: "modifyPower",
                          value: -2000,
                          duration: { type: "thisTurn" },
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
      "entry:eventCounter",
      "cost:returnDon",
      "instruction:modifyPower",
      "composition:costedEffect",
      "composition:selectThenApply",
      "target:opponentLeader",
      "target:opponentCharacters",
      "duration:thisTurn",
    ]),
  );
});

it("parses opponent rested Character or DON refresh lock as mixed public-zone selection", () => {
  const result = parseCardEffectLine(
    "[On Play] Up to 1 of your opponent's rested Character or DON!! cards will not become active in your opponent's next Refresh Phase.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "cannotBecomeActive",
        target: {
          type: "chooseFromZones",
          request: {
            player: "opponent",
            zones: ["characterArea", "costArea"],
            min: 0,
            max: 1,
            filter: {
              categories: ["character", "don"],
              state: "rested",
            },
          },
        },
        duration: { type: "untilStartOfNextTurn", player: "opponent" },
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:preventActivation",
      "target:opponentRestedCards",
      "zone:characterArea",
      "zone:costArea",
      "filter:category:character",
      "filter:category:don",
      "filter:state:rested",
      "duration:opponentNextRefreshPhase",
    ]),
  );
});

it("parses conditional return-DON cost with selected Leader and Character refresh locks", () => {
  const result = parseCardEffectLine(
    "[When Attacking] DON!! \u22123 (You may return the specified number of DON!! cards from your field to your DON!! deck.): If you have 3 or more {Foxy Pirates} type Characters, select up to 1 each of your opponent's rested Leader and Character cards. The selected cards will not become active in your opponent's next Refresh Phase.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "whenAttacking" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "payCost",
              cost: { type: "returnDon", count: 3, optional: true },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "conditional",
              if: {
                type: "fieldCount",
                player: "self",
                op: "gte",
                value: 3,
                filter: {
                  categories: ["character"],
                  typesAny: ["Foxy Pirates"],
                },
              },
              then: {
                type: "sequence",
                effects: [
                  {
                    saveResultAs: "selected:refresh-lock-leader-target",
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "opponent",
                        zones: ["leaderArea"],
                        min: 0,
                        max: 1,
                        filter: { categories: ["leader"], state: "rested" },
                      },
                    },
                  },
                  {
                    saveResultAs: "selected:refresh-lock-character-target",
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "opponent",
                        zones: ["characterArea"],
                        min: 0,
                        max: 1,
                        filter: {
                          categories: ["character"],
                          state: "rested",
                        },
                      },
                    },
                  },
                  {
                    effect: {
                      type: "cannotBecomeActive",
                      duration: {
                        type: "untilStartOfNextTurn",
                        player: "opponent",
                      },
                    },
                  },
                  {
                    effect: {
                      type: "cannotBecomeActive",
                      duration: {
                        type: "untilStartOfNextTurn",
                        player: "opponent",
                      },
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
      "entry:whenAttacking",
      "cost:returnDon",
      "condition:fieldCount",
      "filter:type",
      "instruction:selectTargets",
      "instruction:preventActivation",
      "target:opponentLeader",
      "target:opponentCharacters",
      "duration:opponentNextRefreshPhase",
    ]),
  );
});
