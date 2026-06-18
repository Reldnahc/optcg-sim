import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP06 primitive parser support", () => {
  it("parses power gain followed by delayed selected self-field trash", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [When Attacking] This Character gains +1000 power until the start of your next turn. Then, trash 1 of your {FILM} type Characters at the end of this turn.",
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
                type: "modifyPower",
                value: 1000,
                duration: { type: "untilStartOfNextTurn" },
                target: { type: "self" },
              },
            },
            {
              connector: "then",
              effect: {
                type: "delayed",
                timing: { type: "endOfTurn", turn: "current" },
                effect: {
                  type: "sequence",
                  effects: [
                    {
                      connector: "always",
                      effect: {
                        type: "selectTargets",
                        request: {
                          player: "self",
                          zone: "characterArea",
                          min: 1,
                          max: 1,
                          filter: {
                            categories: ["character"],
                            typesAny: ["FILM"],
                          },
                        },
                      },
                    },
                    {
                      connector: "then",
                      effect: { type: "trash" },
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
        "marker:attachedDon",
        "condition:attachedDonCount",
        "instruction:modifyPower",
        "composition:delayed",
        "instruction:trash",
        "target:yourCharacters",
        "filter:type",
      ]),
    );
  });

  it("parses conditional battle protection and power gain followed by Life movement", () => {
    const result = parseCardEffectLine(
      "[When Attacking] If your Leader has the {New Fish-Man Pirates} type, this Character cannot be K.O.'d in battle and gains +2000 power until the start of your next turn. Then, add 1 card from the top of your Life cards to your hand.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "whenAttacking" },
        condition: {
          type: "hasCardInZone",
          player: "self",
          zone: "leaderArea",
          filter: {
            categories: ["leader"],
            typesAny: ["New Fish-Man Pirates"],
          },
        },
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
                    effect: {
                      type: "protectFromKO",
                      target: { type: "self" },
                      sourceKind: "battle",
                      duration: { type: "untilStartOfNextTurn" },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "modifyPower",
                      target: { type: "self" },
                      value: 2000,
                      duration: { type: "untilStartOfNextTurn" },
                    },
                  },
                ],
              },
            },
            {
              connector: "then",
              effect: {
                type: "moveCards",
                count: 1,
                from: { player: "self", zone: "life", position: "top" },
                to: { player: "self", zone: "hand" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "expression:conditional",
        "instruction:giveProtection",
        "protectionSource:battle",
        "instruction:modifyPower",
        "instruction:moveCards",
      ]),
    );
  });

  it("parses opponent hand reset to deck shuffle followed by draw", () => {
    const result = parseCardEffectLine(
      "[On Play] Your opponent returns all cards in their hand to their deck and shuffles their deck. Then, your opponent draws 5 cards.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
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
                    effect: {
                      type: "moveCards",
                      count: {
                        type: "countMatchingZoneCards",
                        player: "opponent",
                        zone: "hand",
                        per: 1,
                        multiplier: 1,
                      },
                      from: { player: "opponent", zone: "hand" },
                      to: { player: "opponent", zone: "deck" },
                      order: "original",
                    },
                  },
                  {
                    connector: "then",
                    effect: { type: "shuffleDeck", player: "opponent" },
                  },
                ],
              },
            },
            {
              connector: "then",
              effect: { type: "draw", player: "opponent", count: 5 },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:moveCards",
        "cardinality:all",
        "value:dynamic:matchingZoneCards",
        "zone:hand",
        "zone:deck",
        "instruction:shuffleDeck",
        "instruction:draw",
      ]),
    );
  });

  it("parses two trash Character selections into active and rested play primitives", () => {
    const result = parseCardEffectLine(
      "[On Play] Choose up to 1 Character card with a cost of 4 or less and up to 1 Character card with a cost of 2 or less from your trash. Play 1 card and play the other card rested.",
    );
    const triggerResult = parseCardEffectLine(
      "[Trigger] Choose up to 1 Character card with a cost of 4 or less and up to 1 Character card with a cost of 2 or less from your trash. Play 1 card and play the other card rested.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "selectCards",
                zone: "trash",
                player: "self",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  cost: { max: 4 },
                },
              },
            },
            {
              connector: "ifPossible",
              effect: {
                type: "playSelected",
                ignoreCost: true,
              },
            },
            {
              connector: "then",
              effect: {
                type: "selectCards",
                zone: "trash",
                player: "self",
                chooser: "self",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  cost: { max: 2 },
                },
              },
            },
            {
              connector: "ifPossible",
              effect: {
                type: "playSelected",
                enterRested: true,
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
        "instruction:selectCards",
        "instruction:playSelected",
        "zone:trash",
        "filter:category:character",
        "filter:cost",
        "state:rested",
        "composition:selectThenPlay",
      ]),
    );
    expect(triggerResult).toMatchObject({
      block: {
        trigger: { type: "trigger" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "selectCards" } },
            { effect: { type: "playSelected", ignoreCost: true } },
            { effect: { type: "selectCards" } },
            {
              effect: {
                type: "playSelected",
                enterRested: true,
                ignoreCost: true,
              },
            },
          ],
        },
      },
    });
  });

  it("parses K.O. any-number selected targets into selected-count leader power", () => {
    const result = parseCardEffectLine(
      "[Main]/[Counter] Your Leader gains +1000 power during this turn. Then, you may K.O. any number of your {Thriller Bark Pirates} type Characters with a cost of 2 or less. Your Leader gains an additional +1000 power during this turn for every Character K.O.'d.",
    );

    expect(result).toMatchObject({
      block: {
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "modifyPower",
                target: { type: "myLeader" },
                value: 1000,
                duration: { type: "thisTurn" },
              },
            },
            {
              effect: {
                type: "sequence",
                effects: [
                  {
                    saveResultAs: "selected:ko-target",
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "self",
                        zone: "characterArea",
                        min: 0,
                        max: 5,
                        filter: {
                          categories: ["character"],
                          typesAny: ["Thriller Bark Pirates"],
                          cost: { max: 2 },
                        },
                      },
                    },
                  },
                  { effect: { type: "ko" } },
                ],
              },
            },
            {
              effect: {
                type: "modifyPower",
                target: { type: "myLeader" },
                value: {
                  type: "selectedCardCount",
                  selection: "selected:ko-target",
                  multiplier: 1000,
                },
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:modifyPower",
        "instruction:ko",
        "count:anyNumber",
        "filter:type",
        "filter:cost",
        "value:dynamic:selectedCardCount",
        "count:selectedCardCount",
      ]),
    );
  });

  it("parses source-attribute activation followed by player attack-target restriction", () => {
    const result = parseCardEffectLine(
      "[On Play] Set up to 1 of your  attribute Characters with a cost of 4 or less as active. Then, you cannot attack a Leader during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
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
                    saveResultAs: "targetSelection:set-field-active",
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "self",
                        zone: "characterArea",
                        min: 0,
                        max: 1,
                        filter: {
                          attributesFromSource: true,
                          categories: ["character"],
                          cost: { max: 4 },
                        },
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "activate",
                      target: {
                        type: "savedFieldObject",
                        binding: {
                          family: "selectedTargets",
                          saveResultAs: "targetSelection:set-field-active",
                        },
                        player: "self",
                        zone: "characterArea",
                      },
                    },
                  },
                ],
              },
            },
            {
              connector: "then",
              effect: {
                type: "cannotAttackTarget",
                target: { type: "player", player: "self" },
                attackTarget: {
                  player: "opponent",
                  zone: "leaderArea",
                  filter: { categories: ["leader"] },
                },
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:activate",
        "filter:attribute",
        "valueSource:sourceAttribute",
        "instruction:cannotAttackTarget",
        "zone:leaderArea",
        "filter:category:leader",
      ]),
    );
  });
});
