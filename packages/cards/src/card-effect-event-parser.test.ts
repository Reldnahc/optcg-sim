import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect event parser", () => {
  it("parses Main Event rest-DON cost, leader condition, and Stage K.O. target primitives", () => {
    const result = parseCardEffectLine(
      "[Main] You may rest 1 of your DON!! cards: If your Leader is [Imu], K.O. up to 1 of your opponent's Stages with a cost of 7.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "restDon",
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
                  type: "hasCardInZone",
                  zone: "leaderArea",
                  player: "self",
                  filter: {
                    categories: ["leader"],
                    names: ["Imu"],
                  },
                },
                then: {
                  type: "sequence",
                  effects: [
                    {
                      connector: "always",
                      effect: {
                        type: "selectTargets",
                        request: {
                          player: "opponent",
                          zone: "stageArea",
                          filter: {
                            categories: ["stage"],
                            cost: { op: "eq", value: 7 },
                          },
                        },
                      },
                    },
                    {
                      connector: "then",
                      effect: {
                        type: "ko",
                        target: {
                          zone: "stageArea",
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
        "entry:eventMain",
        "sourcePresence:resolveFromDestination",
        "composition:optionalCostedEffect",
        "cost:restDon",
        "condition:leaderIdentity",
        "instruction:ko",
        "target:opponentStages",
        "filter:cost",
        "condition:comparator:eq",
        "composition:selectThenApply",
      ]),
    );
  });

  it("parses Counter conditional power over own Leader or Character card targets", () => {
    const result = parseCardEffectLine(
      "[Counter] If your Leader is [Imu], up to 1 of your Leader or Character cards gains +4000 power during this battle.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: { categories: ["leader"], names: ["Imu"] },
        },
        effect: {
          type: "modifyPower",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["leaderArea", "characterArea"],
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: { categories: ["leader", "character"] },
            },
          },
          value: 4000,
          duration: { type: "thisBattle" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventCounter",
        "condition:leaderIdentity",
        "instruction:modifyPower",
        "target:yourLeaderOrCharacters",
        "cardinality:upTo",
        "modifier:positivePower",
        "duration:thisBattle",
      ]),
    );
  });

  it("parses Counter power followed by conditional trash-to-hand selection", () => {
    const result = parseCardEffectLine(
      "[Counter] Up to 1 of your Leader or Character cards gains +1000 power during this battle. Then, if you have 10 or more cards in your trash, add up to 1 black Character card with a cost of 3 or less from your trash to your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: { type: "chooseFromZones" },
                value: 1000,
                duration: { type: "thisBattle" },
              },
            },
            {
              connector: "then",
              effect: {
                type: "conditional",
                if: {
                  type: "trashCount",
                  player: "self",
                  op: "gte",
                  value: 10,
                },
                then: {
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
                          colorsAny: ["black"],
                          categories: ["character"],
                          cost: { max: 3 },
                        },
                        saveAs: "trashSelection:addToHand",
                        visibility: "bothPlayers",
                      },
                    },
                    {
                      connector: "then",
                      effect: {
                        type: "moveSelected",
                        selection: "trashSelection:addToHand",
                        from: "trash",
                        to: "hand",
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
        "entry:eventCounter",
        "instruction:modifyPower",
        "target:yourLeaderOrCharacters",
        "expression:conditional",
        "condition:trashCount",
        "condition:comparator:gte",
        "instruction:moveSelected",
        "zone:trash",
        "destination:hand",
        "filter:color",
        "filter:category:character",
        "filter:cost",
      ]),
    );
  });

  it("parses Main Event only-matching Characters condition into reusable condition evidence", () => {
    const result = parseCardEffectLine(
      "[Main] You may rest 5 of your DON!! cards: If the only Characters on your field are {Celestial Dragons} type Characters, K.O. up to 1 of your opponent's Characters with a base cost of 6 or less.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: { type: "restDon", count: 5 },
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
                      connector: "always",
                      effect: {
                        type: "selectTargets",
                        request: {
                          player: "opponent",
                          zone: "characterArea",
                          filter: {
                            categories: ["character"],
                            cost: { max: 6 },
                          },
                        },
                      },
                    },
                    {
                      connector: "then",
                      effect: { type: "ko" },
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
        "condition:onlyMatchingFieldCards",
        "zone:characterArea",
        "filter:type",
        "filter:category:character",
        "condition:comparator:lte",
      ]),
    );
  });

  it("parses Main Event rest-DON cost and opponent Character effect negation primitives", () => {
    const result = parseCardEffectLine(
      "[Main] You may rest 2 of your DON!! cards: Negate the effect of up to 1 of your opponent's Characters with a cost of 5 or less during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "restDon",
                  count: 2,
                  chooser: "self",
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
                    connector: "always",
                    effect: {
                      type: "selectTargets",
                      request: {
                        timing: "onResolution",
                        chooser: "self",
                        player: "opponent",
                        zone: "characterArea",
                        min: 0,
                        max: 1,
                        allowFewerIfUnavailable: true,
                        visibility: "public",
                        filter: {
                          categories: ["character"],
                          cost: { max: 5 },
                        },
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "invalidateEffects",
                      target: {
                        type: "savedFieldObject",
                        zone: "characterArea",
                        player: "opponent",
                      },
                      duration: { type: "thisTurn" },
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
        "entry:eventMain",
        "composition:optionalCostedEffect",
        "cost:restDon",
        "instruction:invalidateEffects",
        "cardinality:upTo",
        "target:opponentCharacters",
        "filter:cost",
        "condition:comparator:lte",
        "duration:thisTurn",
        "composition:selectThenApply",
      ]),
    );
  });

  it("parses simple Counter Leader power for this battle", () => {
    const result = parseCardEffectLine(
      "[Counter] Your Leader gains +3000 power during this battle.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "counter" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "modifyPower",
          target: { type: "myLeader" },
          value: 3000,
          duration: { type: "thisBattle" },
        },
      },
    });
  });

  it("parses Main Event top-deck search with name exclusion and trash-rest policy", () => {
    const result = parseCardEffectLine(
      "[Main] Look at 3 cards from the top of your deck; reveal up to 1 {Celestial Dragons} type card other than [The Five Elders Are at Your Service!!!] and add it to your hand. Then, trash the rest.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "main" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "search",
          request: {
            lookCount: 3,
            filter: {
              typesAny: ["Celestial Dragons"],
              nameNot: ["The Five Elders Are at Your Service!!!"],
            },
            revealTo: "bothPlayers",
            destination: "hand",
            remainingCards: { destination: "trash" },
          },
        },
      },
    });
  });

  it("parses life Trigger that activates this card's Main effect as a reference primitive", () => {
    const result = parseCardEffectLine(
      "[Trigger] Activate this card's [Main] effect.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "trigger" },
        sourcePresencePolicy: "noSourceRequired",
        effect: {
          type: "activateReferencedEffect",
          source: { type: "triggerCard" },
          trigger: { type: "main" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:lifeTrigger",
        "instruction:activateReferencedEffect",
        "target:triggerCard",
        "reference:eventMain",
      ]),
    );
  });

  it("parses Your Turn hand play-cost reduction as a modifyCost primitive", () => {
    const result = parseCardEffectLine(
      "[Your Turn] The cost of playing {Celestial Dragons} type Character cards with a cost of 2 or more from your hand will be reduced by 1.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyCost",
          player: "self",
          sourceZone: "hand",
          filter: {
            categories: ["character"],
            typesAny: ["Celestial Dragons"],
            cost: { min: 2 },
          },
          value: -1,
          duration: {
            type: "whileConditionTrue",
            condition: { type: "yourTurn" },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:yourTurn",
        "instruction:modifyCost",
        "zone:hand",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:gte",
        "modifier:costReduction",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it("parses On Play DON return reminder text, filtered trash-to-hand, and DON activation primitives", () => {
    const result = parseCardEffectLine(
      "[On Play] DON!! \u22121 (You may return the specified number of DON!! cards from your field to your DON!! deck.): Add up to 1 purple Event with a cost of 5 or less from your trash to your hand. Then, set up to 1 of your DON!! cards as active.",
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
                          connector: "always",
                          effect: {
                            type: "selectCards",
                            zone: "trash",
                            player: "self",
                            chooser: "self",
                            min: 0,
                            max: 1,
                            filter: {
                              colorsAny: ["purple"],
                              categories: ["event"],
                              cost: { max: 5 },
                            },
                            saveAs: "trashSelection:addToHand",
                            visibility: "bothPlayers",
                          },
                        },
                        {
                          connector: "then",
                          effect: {
                            type: "moveSelected",
                            selection: "trashSelection:addToHand",
                            from: "trash",
                            to: "hand",
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
                          connector: "always",
                          saveResultAs: "targetSelection:set-don-active",
                          effect: {
                            type: "selectTargets",
                            request: {
                              timing: "onResolution",
                              chooser: "self",
                              zone: "costArea",
                              player: "self",
                              min: 0,
                              max: 1,
                              allowFewerIfUnavailable: true,
                              visibility: "public",
                              filter: {
                                categories: ["don"],
                                state: "rested",
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
                                saveResultAs: "targetSelection:set-don-active",
                              },
                              zone: "costArea",
                              player: "self",
                              visibility: "publicOnly",
                              onFailure: "failClosed",
                            },
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
        "composition:costedEffect",
        "cost:returnDon",
        "instruction:moveSelected",
        "filter:color",
        "filter:category:event",
        "filter:cost",
        "condition:comparator:lte",
        "instruction:activate",
        "zone:costArea",
        "filter:category:don",
        "filter:state:rested",
        "composition:selectThenApply",
      ]),
    );
  });

  it("parses On Play DON return reminder text into conditional opponent hand trash primitives", () => {
    const result = parseCardEffectLine(
      "[On Play] DON!! \u22121 (You may return the specified number of DON!! cards from your field to your DON!! deck.): If your opponent has 7 or more cards in their hand, trash 2 cards from your opponent's hand.",
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
                type: "payCost",
                cost: { type: "returnDon", count: 1, optional: true },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "conditional",
                if: {
                  type: "handCount",
                  player: "opponent",
                  op: "gte",
                  value: 7,
                },
                then: {
                  type: "trashFromHand",
                  player: "opponent",
                  chooser: "opponent",
                  count: 2,
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
        "composition:costedEffect",
        "cost:returnDon",
        "expression:conditional",
        "condition:handCount",
        "condition:comparator:gte",
        "player:opponent",
        "instruction:trashFromHand",
        "chooser:opponent",
      ]),
    );
  });
});
