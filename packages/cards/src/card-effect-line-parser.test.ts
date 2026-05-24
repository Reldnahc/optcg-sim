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

  it("recognizes unsupported entry points without marking them supported", () => {
    const result = parseCardEffectLine("[On Block] Draw 1 card.");

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onBlock" },
      },
    });
    expect(result?.evidence).toContain("entry:onBlock");
    expect(result?.evidence).toContain("entrySupport:unsupported");
    expect(result?.evidence).toContain("instruction:draw");
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
        condition: {
          type: "trashCount",
          player: "self",
          op: "gte",
          value: 7,
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "giveProtection",
                target: { type: "self" },
                duration: { type: "permanent" },
              },
            },
            {
              connector: "always",
              effect: {
                type: "giveKeyword",
                target: { type: "self" },
                keyword: "blocker",
                duration: { type: "permanent" },
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
              id: "cost:return-don",
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

  it("parses top-of-deck type search reveal as one reusable search request", () => {
    const result = parseCardEffectLine(
      "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "search",
          request: {
            zone: "deck",
            player: "self",
            lookCount: 5,
            filter: { typesAny: ["Five Elders"] },
            min: 0,
            max: 1,
            destination: "hand",
            revealTo: "bothPlayers",
            remainingCards: {
              destination: "deck",
              position: "bottom",
              order: "ownerChoice",
            },
            shuffleAfter: false,
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:search",
        "look:topDeck",
        "zone:deck",
        "count:positiveInteger",
        "filter:type",
        "cardinality:upTo",
        "destination:hand",
        "reveal:bothPlayers",
        "remaining:rest",
        "remaining:bottomDeck",
        "order:anyOrder",
      ]),
    );
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
                      type: "search",
                      request: {
                        zone: "deck",
                        player: "self",
                        lookCount: 5,
                        filter: {},
                        min: 0,
                        max: 1,
                        destination: "hand",
                        revealTo: "chooserOnly",
                        remainingCards: {
                          destination: "deck",
                          position: "bottom",
                          order: "ownerChoice",
                        },
                        shuffleAfter: false,
                      },
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
        "instruction:search",
        "look:topDeck",
        "filter:any",
        "reveal:chooserOnly",
        "remaining:bottomDeck",
        "instruction:trashFromHand",
      ]),
    );
  });

  it("parses rules text plus start-of-game stage play as separate primitives", () => {
    const result = parseCardEffectLine(
      "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck and at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "startOfGame" },
        sourcePresencePolicy: "noSourceRequired",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "search",
                request: {
                  zone: "deck",
                  player: "self",
                  filter: {
                    categories: ["stage"],
                    typesAny: ["Mary Geoise"],
                  },
                  min: 0,
                  max: 1,
                  destination: "stageArea",
                  revealTo: "chooserOnly",
                  shuffleAfter: false,
                },
              },
            },
            {
              connector: "always",
              effect: {
                type: "playSelected",
                selection: "selected:start-of-game",
                ignoreCost: true,
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "deckRestriction:ignored",
        "deckRestriction:eventCostGte",
        "entry:startOfGame",
        "instruction:search",
        "instruction:playSelected",
        "filter:type",
        "filter:category:stage",
        "destination:stageArea",
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
                          saveResultAs: "selected:trash-play",
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
                            saveAs: "selected:trash-play",
                            visibility: "bothPlayers",
                          },
                        },
                        {
                          connector: "ifPossible",
                          effect: {
                            type: "playSelected",
                            selection: "selected:trash-play",
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
        condition: {
          type: "trashCount",
          player: "self",
          op: "gte",
          value: 19,
        },
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
