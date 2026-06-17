import { describe, expect, it } from "vitest";

import {
  parseCardEffectLine,
  parseCardEffectLineDetailed,
} from "./card-effect-line-parser.js";

describe("card effect line parser", () => {
  it("parses supported entry, marker, and composed draw/trash instructions", () => {
    expect(
      parseCardEffectLine(
        "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
      ),
    ).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "whenAttacking" },
        oncePerTurn: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", count: 2, player: "self" },
            },
            {
              connector: "then",
              effect: {
                type: "trashFromHand",
                count: 1,
                player: "self",
                chooser: "self",
              },
            },
          ],
        },
      },
    });
  });

  it("parses simple On Play draw through the default parser set", () => {
    expect(parseCardEffectLine("[On Play] Draw 1 card.")).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: { type: "draw", count: 1, player: "self" },
      },
      evidence: [
        "entry:onPlay",
        "sourcePresence:mustRemain",
        "instruction:draw",
        "count:positiveInteger",
        "player:self",
        "composition:entryExpression",
      ],
    });
  });

  it("parses On K.O. trash through the same instruction parser", () => {
    expect(
      parseCardEffectLine("[On K.O.] Trash 1 card from your hand."),
    ).toMatchObject({
      block: {
        trigger: { type: "onKO" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "trashFromHand",
          count: 1,
          player: "self",
          chooser: "self",
        },
      },
    });
  });

  it("parses field-control primitives through composition instead of planned placeholders", () => {
    const result = parseCardEffectLine(
      "[On Play] Rest up to 1 of your opponent's Characters and that Character will not become active in your opponent's next Refresh Phase. Then, if your opponent has 2 or more rested Characters, your Leader gains +2000 power until the end of your opponent's next End Phase.",
    );

    expect(result).toMatchObject({
      block: {
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
                    effect: {
                      type: "sequence",
                      effects: [
                        {
                          connector: "always",
                          effect: { type: "selectTargets" },
                        },
                        {
                          connector: "then",
                          effect: { type: "rest" },
                        },
                      ],
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "cannotBecomeActive",
                    },
                  },
                ],
              },
            },
            {
              connector: "then",
              effect: {
                type: "conditional",
                if: {
                  type: "fieldCount",
                  player: "opponent",
                  filter: {
                    categories: ["character"],
                    state: "rested",
                  },
                  op: "gte",
                  value: 2,
                },
                then: {
                  type: "modifyPower",
                  target: { type: "myLeader" },
                  value: 2000,
                  duration: { type: "untilEndOfNextTurn", player: "opponent" },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).not.toContain("instructionSupport:planned");
    expect(result?.evidence).toContain("instruction:rest");
    expect(result?.evidence).toContain("instruction:preventActivation");
    expect(result?.evidence).toContain("condition:opponentFieldCount");
    expect(result?.evidence).toContain("instruction:modifyPower");
  });

  it("parses conditional continuous protection and keyword bodies compositionally", () => {
    const result = parseCardEffectLine(
      "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects and gains [Blocker].",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "giveProtection",
                target: { type: "self" },
                duration: {
                  type: "whileConditionTrue",
                  condition: {
                    type: "trashCount",
                    player: "self",
                    op: "gte",
                    value: 7,
                  },
                },
              },
            },
            {
              connector: "always",
              effect: {
                type: "giveKeyword",
                target: { type: "self" },
                keyword: "blocker",
                duration: {
                  type: "whileConditionTrue",
                  condition: {
                    type: "trashCount",
                    player: "self",
                    op: "gte",
                    value: 7,
                  },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toContain("entry:implicitPermanent");
    expect(result?.evidence).toContain("condition:trashCount");
    expect(result?.evidence).toContain("instruction:giveProtection");
    expect(result?.evidence).toContain("instruction:giveKeyword");
    expect(result?.evidence).toContain("keyword:anySupported");
  });

  it("parses conditional continuous protection without requiring keyword text", () => {
    expect(
      parseCardEffectLine(
        "If you have 7 or more cards in your trash, this Character cannot be removed from the field by your opponent's effects.",
      ),
    ).toMatchObject({
      block: {
        category: "permanent",
        effect: {
          type: "giveProtection",
          target: { type: "self" },
        },
      },
    });
  });

  it("parses conditional continuous keyword before protection", () => {
    expect(
      parseCardEffectLine(
        "If you have 7 or more cards in your trash, this Character gains [Banish] and cannot be removed from the field by your opponent's effects.",
      ),
    ).toMatchObject({
      block: {
        category: "permanent",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "giveKeyword", keyword: "banish" },
            },
            {
              connector: "always",
              effect: { type: "giveProtection" },
            },
          ],
        },
      },
    });
  });

  it("parses return-DON cost into an engine-supported On Play payCost sequence", () => {
    expect(parseCardEffectLine("[On Play] DON!! −1: Draw 1 card.")).toEqual({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "cost:returnDon",
              connector: "always",
              effect: {
                type: "payCost",
                cost: { type: "returnDon", count: 1, optional: true },
              },
            },
            {
              id: "body:after-cost",
              connector: "ifYouDo",
              effect: { type: "draw", count: 1, player: "self" },
            },
          ],
        },
      },
      evidence: [
        "entry:onPlay",
        "sourcePresence:mustRemain",
        "composition:costedEffect",
        "cost:returnDon",
        "count:positiveInteger",
        "instruction:draw",
        "count:positiveInteger",
        "player:self",
        "composition:entryExpression",
      ],
    });
  });

  it("parses conditional attack power reduction compositionally", () => {
    expect(
      parseCardEffectLine(
        "[When Attacking] If you have 6 or less DON!! cards on your field, give up to 1 of your opponent's Characters −1000 power during this turn.",
      ),
    ).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "whenAttacking" },
        sourcePresencePolicy: "mustRemainInSameZone",
        condition: {
          type: "fieldCount",
          player: "self",
          filter: { categories: ["don"] },
          op: "lte",
          value: 6,
        },
        effect: {
          type: "modifyPower",
          value: -1000,
          duration: { type: "thisTurn" },
        },
      },
    });
  });

  it("parses costed private top-of-deck search with trailing trash compositionally", () => {
    const result = parseCardEffectLine(
      "[On Play] DON!! −1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
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
                      type: "revealTop",
                      player: "self",
                      zone: "deck",
                      count: 5,
                      saveAs: "set:search-look",
                      visibility: "chooserOnly",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "selectFromSet",
                      set: "set:search-look",
                      chooser: "self",
                      min: 0,
                      max: 1,
                      filter: {},
                      saveAs: "searchSelection:hand",
                    },
                  },
                  {
                    connector: "ifPreviousSucceeded",
                    effect: {
                      type: "moveSelected",
                      selection: "searchSelection:hand",
                      from: "set:search-look",
                      to: "hand",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "placeSetRemainder",
                      set: "set:search-look",
                      owner: "self",
                      destination: "deck",
                      position: "bottom",
                      order: "chooser",
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "trashFromHand",
                      count: 1,
                      player: "self",
                      chooser: "self",
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
        "cost:returnDon",
        "instruction:revealTop",
        "instruction:selectFromSet",
        "instruction:moveSelected",
        "instruction:placeSetRemainder",
        "look:topDeck",
        "filter:any",
        "reveal:chooserOnly",
        "remaining:bottomDeck",
        "instruction:trashFromHand",
      ]),
    );
  });

  it("parses Activate Main choose-one trash cost into draw compositionally", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] You may trash 1 of your {Celestial Dragons} type Characters or 1 card from your hand: Draw 1 card.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        oncePerTurn: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "paidCost",
              effect: {
                type: "payCost",
                cost: {
                  type: "chooseOne",
                  optional: true,
                  options: [
                    {
                      type: "trashFromField",
                      chooser: "self",
                      optional: true,
                      count: 1,
                      filter: {
                        categories: ["character"],
                        typesAny: ["Celestial Dragons"],
                      },
                    },
                    {
                      type: "trashFromHand",
                      chooser: "self",
                      optional: true,
                      count: 1,
                    },
                  ],
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: { type: "draw", count: 1, player: "self" },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:activateMain",
        "marker:oncePerTurn",
        "composition:optionalCostedEffect",
        "cost:chooseOne",
        "cost:trashFromField",
        "cost:trashFromHand",
        "filter:type",
        "filter:category:character",
        "instruction:draw",
      ]),
    );
  });

  it("parses conditional Activate Main sequence-cost trash-and-play from trash compositionally", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] If your Leader is [Imu], you may rest 1 of your DON!! cards and trash 1 card from your hand: Trash all of your Characters and play up to 5 {Five Elders} type Character cards with 5000 power and different card names from your trash.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        sourcePresencePolicy: "mustRemainInSameZone",
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: { names: ["Imu"] },
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "paidCost",
              effect: {
                type: "payCost",
                cost: {
                  type: "sequence",
                  optional: true,
                  costs: [
                    {
                      type: "restDon",
                      count: 1,
                      chooser: "self",
                    },
                    {
                      type: "trashFromHand",
                      count: 1,
                      chooser: "self",
                    },
                  ],
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
                      type: "trash",
                      target: {
                        type: "all",
                        zone: "characterArea",
                        player: "self",
                        filter: { categories: ["character"] },
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
                          saveResultAs: "trashSelection:play",
                          effect: {
                            type: "selectCards",
                            zone: "trash",
                            player: "self",
                            chooser: "self",
                            min: 0,
                            max: 5,
                            filter: {
                              categories: ["character"],
                              typesAny: ["Five Elders"],
                              power: { op: "eq", value: 5000 },
                              custom: "differentNames",
                            },
                            saveAs: "trashSelection:play",
                            visibility: "bothPlayers",
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
        "condition:leaderIdentity",
        "composition:conditionalCostedEffect",
        "cost:restDon",
        "cost:trashFromHand",
        "composition:costSequence",
        "instruction:trash",
        "cardinality:all",
        "instruction:playSelected",
        "filter:type",
        "filter:category:character",
        "filter:power",
        "filter:differentNames",
        "composition:selectThenPlay",
      ]),
    );
  });

  it("parses Your Turn conditional Leader power as continuous primitives", () => {
    const result = parseCardEffectLine(
      "[Your Turn] If you have 19 or more cards in your trash, your Leader gains +1000 power.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "modifyPower",
          target: { type: "myLeader" },
          value: 1000,
          duration: { type: "whileConditionTrue" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:yourTurn",
        "expression:conditionalContinuous",
        "condition:trashCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "target:yourLeader",
        "modifier:positivePower",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it("parses Activate Main rest-cost play-from-hand with dynamic cost predicate compositionally", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] You may rest this card and 3 of your DON!! cards: Play up to 1 black {Five Elders} type Character card with a cost equal to or less than the number of DON!! cards on your field from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "paidCost",
              effect: {
                type: "payCost",
                cost: {
                  type: "sequence",
                  optional: true,
                  costs: [
                    { type: "restSelf" },
                    { type: "restDon", count: 3, chooser: "self" },
                  ],
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
                    saveResultAs: "handSelection:play-from-hand",
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      player: "self",
                      chooser: "self",
                      min: 0,
                      max: 1,
                      filter: {
                        colorsAny: ["black"],
                        categories: ["character"],
                        typesAny: ["Five Elders"],
                        custom: "costLteSelfDonFieldCount",
                      },
                      saveAs: "handSelection:play-from-hand",
                      visibility: "chooserOnly",
                    },
                  },
                  {
                    connector: "ifPossible",
                    effect: {
                      type: "playSelected",
                      selection: "handSelection:play-from-hand",
                      ignoreCost: true,
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
        "composition:optionalCostedEffect",
        "composition:costSequence",
        "cost:restSelf",
        "target:thisCard",
        "cost:restDon",
        "cardinality:exact",
        "target:yourDonCards",
        "instruction:playSelected",
        "zone:hand",
        "filter:color",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "valueSource:donFieldCount:self",
        "composition:selectThenPlay",
      ]),
    );
  });

  it("parses Activate Main filtered self-trash cost before conditional play from trash", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] You may trash this Character with a cost of 20 or more: If you have 9 or more DON!! cards on your field, play up to 1 [Kouzuki Momonosuke] with a cost of 9 from your trash.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "payCost",
                cost: {
                  type: "trashSelf",
                  optional: true,
                  filter: {
                    categories: ["character"],
                    cost: { min: 20 },
                  },
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "conditional",
                if: {
                  type: "fieldCount",
                  player: "self",
                  filter: { categories: ["don"] },
                  op: "gte",
                  value: 9,
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
                          names: ["Kouzuki Momonosuke"],
                          cost: { op: "eq", value: 9 },
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
        "entry:activateMain",
        "composition:optionalCostedEffect",
        "cost:trashSelf",
        "filter:cost",
        "condition:donFieldCount",
        "instruction:playSelected",
        "composition:selectThenPlay",
      ]),
    );
  });

  it("parses conditional continuous set-base-power from reusable condition and target primitives", () => {
    const result = parseCardEffectLine(
      "[Your Turn] If you have 10 or more cards in your trash, set the base power of all of your {Five Elders} type Characters to 7000.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "setBasePower",
          target: {
            type: "all",
            zone: "characterArea",
            player: "self",
            filter: {
              categories: ["character"],
              typesAny: ["Five Elders"],
            },
          },
          value: 7000,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "and",
              conditions: [
                { type: "yourTurn" },
                { type: "trashCount", player: "self", op: "gte", value: 10 },
              ],
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:yourTurn",
        "condition:yourTurn",
        "composition:conditionAnd",
        "expression:conditionalContinuous",
        "condition:trashCount",
        "condition:comparator:gte",
        "instruction:setBasePower",
        "cardinality:all",
        "filter:type",
        "filter:category:character",
        "value:basePower:positiveInteger",
      ]),
    );
  });

  it("keeps Main conditional set-base-power as an action block", () => {
    const result = parseCardEffectLine(
      "[Main] If you have 10 DON!! cards on your field, all of your [Prisoner of Impel Down] cards' base power becomes 7000 during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        condition: {
          type: "fieldCount",
          player: "self",
          filter: { categories: ["don"] },
          op: "eq",
          value: 10,
        },
        effect: {
          type: "setBasePower",
          target: {
            type: "all",
            zone: "characterArea",
            player: "self",
            filter: {
              categories: ["character"],
              names: ["Prisoner of Impel Down"],
            },
          },
          value: 7000,
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventMain",
        "expression:conditionalContinuous",
        "condition:donFieldCount",
        "condition:comparator:eq",
        "instruction:setBasePower",
        "cardinality:all",
        "filter:name",
        "filter:category:character",
        "value:basePower:positiveInteger",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses optional single hand-trash cost into reusable selected-target K.O. composition", () => {
    const result = parseCardEffectLine(
      "[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 5 or less.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
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
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    saveResultAs: "selected:ko-target",
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "opponent",
                        zone: "characterArea",
                        filter: {
                          categories: ["character"],
                          baseCost: { max: 5 },
                        },
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "ko",
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
        "composition:optionalCostedEffect",
        "cost:trashFromHand",
        "instruction:ko",
        "cardinality:upTo",
        "target:opponentCharacters",
        "filter:cost",
        "condition:comparator:lte",
        "composition:selectThenApply",
      ]),
    );
  });

  it("fails closed for unknown entry points", () => {
    expect(parseCardEffectLine("[Unknown] Draw 1 card.")).toBeUndefined();
  });

  it("reports entry-point failures", () => {
    expect(parseCardEffectLineDetailed("[Unknown] Draw 1 card.")).toEqual({
      ok: false,
      diagnostic: {
        stage: "entryPoint",
        reason: "no entry-point parser matched",
        text: "[Unknown] Draw 1 card.",
      },
    });
  });

  it("reports expression failures after entry and marker parsing", () => {
    expect(
      parseCardEffectLineDetailed(
        "[When Attacking] [Once Per Turn] unsupported body.",
      ),
    ).toEqual({
      ok: false,
      diagnostic: {
        stage: "expression",
        reason: "no expression parser matched",
        text: "unsupported body.",
      },
    });
  });
});
