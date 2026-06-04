import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect event parser", () => {
  it("parses Main Event named Leader keyword grant as target, keyword, and duration primitives", () => {
    const result = parseCardEffectLine(
      "[Main] Your [Monkey.D.Luffy] Leader gains [Unblockable] during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "giveKeyword",
          target: {
            type: "all",
            zone: "leaderArea",
            player: "self",
            filter: {
              categories: ["leader"],
              names: ["Monkey.D.Luffy"],
            },
          },
          keyword: "unblockable",
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventMain",
        "instruction:giveKeyword",
        "target:yourLeader",
        "filter:name",
        "filter:category:leader",
        "keyword:anySupported",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses optional hand-trash cost into conditional Life setup and self power sequence", () => {
    const result = parseCardEffectLine(
      "[When Attacking] You may trash 1 card from your hand: If you have 1 or less Life cards, add up to 1 card from the top of your deck to the top of your Life cards. Then, this Character gains +1000 power during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "whenAttacking" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "trashFromHand",
                  count: 1,
                  chooser: "self",
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
                      type: "conditional",
                      if: {
                        type: "lifeCount",
                        player: "self",
                        op: "lte",
                        value: 1,
                      },
                      then: {
                        type: "moveCards",
                        count: 1,
                        from: { player: "self", zone: "deck", position: "top" },
                        to: { player: "self", zone: "life", position: "top" },
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "modifyPower",
                      target: { type: "self" },
                      value: 1000,
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
        "composition:optionalCostedEffect",
        "cost:trashFromHand",
        "condition:lifeCount",
        "instruction:moveCards",
        "destination:life",
        "instruction:modifyPower",
        "target:thisCharacter",
        "duration:thisTurn",
      ]),
    );
  });

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

  it("parses Counter power over a named self field card target", () => {
    const result = parseCardEffectLine(
      "[Counter] Up to 1 of your [Enel] cards gains +2000 power during this battle.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
        sourcePresencePolicy: "resolveFromDestinationZone",
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
              filter: { names: ["Enel"] },
            },
          },
          value: 2000,
          duration: { type: "thisBattle" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventCounter",
        "instruction:modifyPower",
        "target:yourNamedCards",
        "filter:name",
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

  it("parses costed Main Event conditional self power and opponent power-filtered KO sequence", () => {
    const result = parseCardEffectLine(
      "[Main] DON!! \u22121: If your Leader is [Enel], up to 1 of your Leader or Character cards gains +1000 power during this turn. Then, K.O. up to 1 of your opponent's Characters with 3000 power or less.",
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
                      type: "conditional",
                      if: {
                        type: "hasCardInZone",
                        player: "self",
                        zone: "leaderArea",
                        filter: {
                          categories: ["leader"],
                          names: ["Enel"],
                        },
                      },
                      then: {
                        type: "modifyPower",
                        target: { type: "chooseFromZones" },
                        value: 1000,
                        duration: { type: "thisTurn" },
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
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
                                currentPower: { max: 3000 },
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
        "cost:returnDon",
        "condition:leaderIdentity",
        "instruction:modifyPower",
        "target:yourLeaderOrCharacters",
        "duration:thisTurn",
        "instruction:ko",
        "filter:currentPower",
        "condition:comparator:lte",
      ]),
    );
  });

  it("parses costed Main Event draw then direct opponent Character refresh lock sequence", () => {
    const result = parseCardEffectLine(
      "[Main] DON!! \u22121: Draw 1 card. Then, up to 1 of your opponent's rested Characters with 6000 power or less will not become active in your opponent's next Refresh Phase.",
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
                    effect: { type: "draw", player: "self", count: 1 },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "cannotBecomeActive",
                      target: {
                        type: "choose",
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
                            state: "rested",
                            currentPower: { max: 6000 },
                          },
                        },
                      },
                      duration: {
                        type: "untilStartOfNextTurn",
                        player: "opponent",
                      },
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
        "cost:returnDon",
        "instruction:draw",
        "instruction:preventActivation",
        "cardinality:upTo",
        "target:opponentCharacters",
        "filter:state:rested",
        "filter:currentPower",
        "duration:opponentNextRefreshPhase",
      ]),
    );
  });

  it("parses costed Main Event multi-target opponent Character refresh lock sequence", () => {
    const result = parseCardEffectLine(
      "[Main] You may rest 2 of your DON!! cards: Up to 2 of your opponent's rested Characters with a cost of 7 or less will not become active in your opponent's next Refresh Phase.",
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
                type: "cannotBecomeActive",
                target: {
                  type: "choose",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "opponent",
                    zone: "characterArea",
                    min: 0,
                    max: 2,
                    allowFewerIfUnavailable: true,
                    visibility: "public",
                    filter: {
                      categories: ["character"],
                      state: "rested",
                      cost: { max: 7 },
                    },
                  },
                },
                duration: {
                  type: "untilStartOfNextTurn",
                  player: "opponent",
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
        "cost:restDon",
        "instruction:preventActivation",
        "cardinality:upTo",
        "filter:state:rested",
        "filter:cost",
        "duration:opponentNextRefreshPhase",
      ]),
    );
  });

  it("parses costed Main Event draw then filtered opponent Character rest sequence", () => {
    const result = parseCardEffectLine(
      "[Main] DON!! \u22122: Draw 1 card. Then, rest up to 1 of your opponent's Characters with 5000 power or less.",
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
                cost: { type: "returnDon", count: 2, optional: true },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    effect: { type: "draw", player: "self", count: 1 },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "sequence",
                      effects: [
                        {
                          connector: "always",
                          saveResultAs: "selected:thatCharacter",
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
                                currentPower: { max: 5000 },
                              },
                            },
                          },
                        },
                        {
                          connector: "then",
                          effect: { type: "rest" },
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
        "entry:eventMain",
        "cost:returnDon",
        "instruction:draw",
        "instruction:rest",
        "cardinality:upTo",
        "target:opponentCharacters",
        "filter:currentPower",
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
});
