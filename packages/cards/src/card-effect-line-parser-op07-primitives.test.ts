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

it("parses Trigger play from trash with owned filtered source wording", () => {
  const result = parseCardEffectLine(
    "[Trigger] Play up to 1 of your {Egghead} type Character cards with a cost of 5 or less from your trash.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "trigger" },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "trashSelection:play",
            effect: {
              type: "selectCards",
              zone: "trash",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                typesAny: ["Egghead"],
                cost: { max: 5 },
              },
            },
          },
          {
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
      "entry:lifeTrigger",
      "instruction:playSelected",
      "zone:trash",
      "filter:type",
      "filter:category:character",
      "filter:cost",
      "composition:selectThenPlay",
    ]),
  );
});

it("parses End of Your Turn conditional typed Character activation", () => {
  const result = parseCardEffectLine(
    "[End of Your Turn] If you have 3 or less Life cards, set up to 1 {Egghead} type Character with a cost of 5 or less as active.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "endOfYourTurn" },
      condition: { type: "lifeCount", player: "self", op: "lte", value: 3 },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "targetSelection:set-field-active",
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  typesAny: ["Egghead"],
                  cost: { max: 5 },
                },
              },
            },
          },
          {
            effect: {
              type: "activate",
              target: {
                type: "savedFieldObject",
                zone: "characterArea",
                player: "self",
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:endOfYourTurn",
      "condition:lifeCount",
      "instruction:activate",
      "filter:type",
      "filter:category:character",
      "filter:cost",
      "state:active",
      "composition:selectThenApply",
    ]),
  );
});

it("parses rest-DON cost with reveal top play rested and bottom cleanup", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] \u2781 (You may rest the specified number of DON!! cards in your cost area.): Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea} type Character card with a cost of 4 or less, you may play that card rested. Then, place the rest at the bottom of your deck.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "payCost",
              cost: { type: "restDon", count: 2 },
            },
          },
          {
            effect: {
              type: "sequence",
              effects: [
                { effect: { type: "revealTop", player: "self", count: 1 } },
                {
                  effect: {
                    type: "selectFromSet",
                    min: 0,
                    max: 1,
                    filter: {
                      categories: ["character"],
                      typesAny: ["The Seven Warlords of the Sea"],
                      cost: { max: 4 },
                    },
                  },
                },
                {
                  effect: {
                    type: "playSelected",
                    enterRested: true,
                    ignoreCost: true,
                  },
                },
                {
                  effect: {
                    type: "placeSetRemainder",
                    destination: "deck",
                    position: "bottom",
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
      "cost:restDon",
      "instruction:revealTop",
      "instruction:playSelected",
      "instruction:placeSetRemainder",
      "filter:type",
      "filter:category:character",
      "filter:cost",
      "state:rested",
      "composition:optionalCostedEffect",
    ]),
  );
});
