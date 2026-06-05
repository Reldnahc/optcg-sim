import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect event parser life trigger and reaction cases", () => {
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

  it("parses life Trigger play-this-card as source-card play primitive", () => {
    const result = parseCardEffectLine(
      "[Trigger] If your Leader is [Monkey.D.Luffy], play this card.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "trigger" },
        sourcePresencePolicy: "noSourceRequired",
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: {
            categories: ["leader"],
            names: ["Monkey.D.Luffy"],
          },
        },
        effect: {
          type: "playSource",
          source: { type: "triggerCard" },
          ignoreCost: true,
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:lifeTrigger",
        "condition:leaderIdentity",
        "filter:name",
        "instruction:playSource",
        "target:triggerCard",
      ]),
    );
  });

  it("parses optional-cost life Trigger play-this-card compositionally", () => {
    const result = parseCardEffectLine(
      "[Trigger] You may trash 1 card from your hand: Play this card.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "trigger" },
        sourcePresencePolicy: "noSourceRequired",
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
                type: "playSource",
                source: { type: "triggerCard" },
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
        "composition:optionalCostedEffect",
        "cost:trashFromHand",
        "instruction:playSource",
        "target:triggerCard",
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

  it("parses life-removed reactions into trigger, sequence, draw, and draw-prevention primitives", () => {
    const result = parseCardEffectLine(
      "[Your Turn] When a card is removed from your or your opponent's Life cards, draw 1 card. Then, you cannot draw cards using your own effects during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "lifeRemoved", players: ["self", "opponent"] },
        condition: { type: "yourTurn" },
        sourcePresencePolicy: "mustRemainInSameZone",
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
                type: "preventDraw",
                player: "self",
                source: "ownEffects",
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:yourTurn",
        "condition:yourTurn",
        "trigger:lifeRemoved",
        "expression:sequence",
        "instruction:draw",
        "instruction:preventDraw",
        "target:player",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses opponent Event or Blocker activation reactions into reveal and dynamic power primitives", () => {
    const result = parseCardEffectLine(
      "When your opponent activates an Event or [Blocker], reveal up to 1 card from the top of your Life cards. This Character gains +1000 power during this turn per 1 cost on the revealed card.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "opponentActivated",
          activations: ["event", "blocker"],
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "revealTop",
                player: "self",
                zone: "life",
                count: 1,
                min: 0,
                visibility: "bothPlayers",
              },
            },
            {
              connector: "then",
              effect: {
                type: "modifyPower",
                target: { type: "self" },
                value: {
                  type: "sumSelectedCardCosts",
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
        "entry:implicitReaction",
        "trigger:opponentActivated",
        "activation:event",
        "activation:blocker",
        "instruction:revealTop",
        "zone:life",
        "connector:sentence",
        "instruction:modifyPower",
        "value:dynamic:selectedCardCost",
      ]),
    );
  });

  it("parses blocker-only opponent activation reactions with composed Life-zero win condition", () => {
    const result = parseCardEffectLine(
      "When your opponent activates [Blocker], if either you or your opponent has 0 Life cards, you win the game.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "opponentActivated",
          activations: ["blocker"],
        },
        condition: {
          type: "or",
          conditions: [
            { type: "lifeCount", player: "self", op: "eq", value: 0 },
            { type: "lifeCount", player: "opponent", op: "eq", value: 0 },
          ],
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "winGame",
          player: "self",
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitReaction",
        "trigger:opponentActivated",
        "activation:blocker",
        "expression:conditional",
        "composition:conditionOr",
        "condition:lifeCount",
        "condition:comparator:eq",
        "condition:threshold:nonNegativeInteger",
        "instruction:winGame",
        "player:self",
        "player:opponent",
      ]),
    );
    expect(result?.evidence).not.toContain("activation:event");
  });
});
