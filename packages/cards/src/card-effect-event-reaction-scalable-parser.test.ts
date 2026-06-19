import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("scalable event reaction parser primitives", () => {
  it("parses DON returned variants without binding the trigger to one body", () => {
    const byYourEffect = parseCardEffectLine(
      "[Opponent's Turn] [Once Per Turn] When a DON!! card on your field is returned to your DON!! deck by your effect, add up to 1 DON!! card from your DON!! deck and set it as active.",
    );

    expect(byYourEffect).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "opponentTurn" },
        oncePerTurn: true,
        trigger: { type: "donReturned", player: "self" },
      },
    });
    expect(byYourEffect?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:donReturned",
        "player:self",
        "instruction:moveCards",
        "destination:costArea",
        "state:active",
      ]),
    );

    const fieldReturned = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When a DON!! card on the field is returned to your DON!! deck, this Leader gains +1000 power during this turn.",
    );

    expect(fieldReturned).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: { type: "donReturned", player: "self" },
        effect: {
          type: "modifyPower",
          duration: { type: "thisTurn" },
        },
      },
    });

    const aggregateReturned = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When 2 or more DON!! cards on your field are returned to your DON!! deck, add up to 1 DON!! card from your DON!! deck and set it as active, and add up to 1 additional DON!! card and rest it.",
    );

    expect(aggregateReturned).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: {
          type: "eventCount",
          count: { op: "gte", value: 2 },
          trigger: { type: "donReturned", player: "self" },
        },
        effect: { type: "sequence" },
      },
    });
    expect(aggregateReturned?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:donReturned",
        "count:positiveInteger",
        "instruction:moveCards",
        "destination:costArea",
        "state:active",
        "state:rested",
      ]),
    );
  });

  it("parses aggregate DON returned reactions with Stage activation follow-up", () => {
    const result = parseCardEffectLine(
      "[Once Per Turn] When 2 or more DON!! cards on your field are returned to your DON!! deck, add up to 1 DON!! card from your DON!! deck and rest it. Then, set up to 1 of your purple Stages as active.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        oncePerTurn: true,
        trigger: {
          type: "eventCount",
          count: { op: "gte", value: 2 },
          trigger: { type: "donReturned", player: "self" },
        },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "moveCards",
                min: 0,
                count: 1,
                from: { player: "self", zone: "donDeck", position: "top" },
                to: { player: "self", zone: "costArea" },
                destinationState: "rested",
              },
            },
            {
              connector: "then",
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "self",
                        zone: "stageArea",
                        min: 0,
                        max: 1,
                        filter: {
                          categories: ["stage"],
                          colorsAny: ["purple"],
                        },
                      },
                    },
                  },
                  {
                    effect: {
                      type: "activate",
                      target: {
                        type: "savedFieldObject",
                        zone: "stageArea",
                        player: "self",
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
        "trigger:donReturned",
        "count:positiveInteger",
        "instruction:moveCards",
        "destination:costArea",
        "state:rested",
        "instruction:activate",
        "zone:stageArea",
        "filter:color",
        "filter:category:stage",
        "composition:selectThenApply",
      ]),
    );
  });

  it("parses bare Character K.O. reactions as field-removal primitives for either player", () => {
    const result = parseCardEffectLine(
      "[Once Per Turn] When a Character is K.O.'d, draw 1 card and trash 1 card from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        oncePerTurn: true,
        trigger: {
          type: "anyOf",
          triggers: [
            {
              type: "fieldRemoved",
              player: "self",
              filter: { categories: ["character"] },
              sourceKind: "ko",
            },
            {
              type: "fieldRemoved",
              player: "opponent",
              filter: { categories: ["character"] },
              sourceKind: "ko",
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "composition:triggerAnyOf",
        "instruction:draw",
        "instruction:trashFromHand",
      ]),
    );
  });

  it("parses trigger-activated reactions as reusable canonical event hooks", () => {
    const drawTrash = parseCardEffectLine(
      "[Once Per Turn] When a [Trigger] activates, draw 2 cards and trash 2 cards from your hand.",
    );

    expect(drawTrash).toMatchObject({
      block: {
        category: "auto",
        oncePerTurn: true,
        trigger: {
          type: "anyOf",
          triggers: [
            { type: "triggerActivated", player: "self" },
            { type: "triggerActivated", player: "opponent" },
          ],
        },
      },
    });
    expect(drawTrash?.evidence).toEqual(
      expect.arrayContaining([
        "activation:trigger",
        "composition:triggerAnyOf",
        "instruction:draw",
        "instruction:trashFromHand",
      ]),
    );

    const blocker = parseCardEffectLine(
      "[Opponent's Turn] When a [Trigger] activates, this Character gains [Blocker] during this turn.",
    );

    expect(blocker).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "opponentTurn" },
        trigger: {
          type: "anyOf",
          triggers: [
            { type: "triggerActivated", player: "self" },
            { type: "triggerActivated", player: "opponent" },
          ],
        },
        effect: {
          type: "giveKeyword",
          keyword: "blocker",
          duration: { type: "thisTurn" },
        },
      },
    });
  });

  it("parses Life-to-hand reactions as destination-filtered life-removal hooks", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When a card is added to your hand from your Life, this Character gains +2000 power during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: {
          type: "lifeRemoved",
          players: ["self"],
          destination: "hand",
        },
        effect: {
          type: "modifyPower",
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:lifeRemoved",
        "player:self",
        "instruction:modifyPower",
      ]),
    );
  });

  it("parses draw outside Draw Phase reactions as reusable card-drawn hooks", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When you draw a card outside of your Draw Phase, this Character gains +2000 power during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: {
          type: "cardDrawn",
          player: "self",
          phase: { not: "draw" },
        },
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: 2000,
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:cardDrawn",
        "player:self",
        "condition:phase:notDraw",
        "instruction:modifyPower",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses opponent Event activation reactions with reusable all-character power grants", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When your opponent activates an Event, all of your Characters gain +2000 power during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: {
          type: "opponentActivated",
          activations: ["event"],
        },
        effect: {
          type: "modifyPower",
          target: {
            type: "all",
            player: "self",
            zone: "characterArea",
            filter: { categories: ["character"] },
          },
          value: 2000,
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:opponentActivated",
        "activation:event",
        "instruction:modifyPower",
        "cardinality:all",
        "zone:characterArea",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses opponent Event activation reactions with forced hand bottom-deck placement", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When your opponent activates an Event, your opponent must place 1 card from their hand at the bottom of their deck.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: {
          type: "opponentActivated",
          activations: ["event"],
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "handSelection:opponent-hand-to-deck-bottom",
              effect: {
                type: "selectCards",
                zone: "hand",
                player: "opponent",
                chooser: "opponent",
                min: 1,
                max: 1,
              },
            },
            {
              connector: "then",
              effect: {
                type: "moveSelected",
                selection: "handSelection:opponent-hand-to-deck-bottom",
                from: "hand",
                to: "deck",
                position: "bottom",
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:opponentActivated",
        "activation:event",
        "instruction:moveSelected",
        "zone:hand",
        "player:opponent",
        "chooser:opponent",
        "zone:deck",
        "position:bottom",
      ]),
    );
  });

  it("parses own Leader-or-Character DON attachment reactions into cost reduction", () => {
    const result = parseCardEffectLine(
      "[Your Turn] When this Leader or any of your Characters is given a DON!! card, give up to 1 of your opponent's Characters with a cost of 7 or less −1 cost during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        trigger: {
          type: "donAttached",
          player: "self",
          target: "yourLeaderOrCharacters",
        },
        effect: {
          type: "modifyCost",
          target: {
            type: "choose",
            request: {
              player: "opponent",
              zone: "characterArea",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                cost: { max: 7 },
              },
            },
          },
          value: -1,
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:donAttached",
        "target:yourLeaderOrCharacters",
        "player:self",
        "instruction:modifyCost",
        "filter:cost",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses source Character DON attachment reactions through the same trigger primitive", () => {
    const result = parseCardEffectLine(
      "When this Character is given a DON!! card, draw 1 card.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "donAttached",
          player: "self",
          target: "self",
          filter: { categories: ["character"] },
        },
        effect: { type: "draw", player: "self", count: 1 },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:donAttached",
        "target:thisCharacter",
        "player:self",
        "filter:category:character",
        "instruction:draw",
      ]),
    );
  });

  it("parses reversed Blocker-or-Event activation reactions with conditional optional deck trash", () => {
    const result = parseCardEffectLine(
      "[Your Turn] When your opponent activates [Blocker] or an Event, if your Leader has the {East Blue} type, you may trash 4 cards from the top of your deck.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        trigger: {
          type: "opponentActivated",
          activations: ["blocker", "event"],
        },
        effect: {
          type: "conditional",
          if: {
            type: "hasCardInZone",
            zone: "leaderArea",
            player: "self",
            filter: {
              categories: ["leader"],
              typesAny: ["East Blue"],
            },
          },
          then: { type: "sequence" },
        },
      },
    });
    expect(
      containsEffect(result, {
        type: "moveCards",
        count: 4,
        from: { player: "self", zone: "deck", position: "top" },
        to: { player: "self", zone: "trash" },
      }),
    ).toBe(true);
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:opponentActivated",
        "activation:blocker",
        "activation:event",
        "expression:conditional",
        "condition:leaderIdentity",
        "instruction:moveCards",
        "zone:deck",
        "destination:trash",
      ]),
    );
  });

  it("parses self Event activation reactions through canonical effect queue events", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] [Once Per Turn] When you activate an Event, add up to 1 DON!! card from your DON!! deck and set it as active.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "opponentTurn" },
        oncePerTurn: true,
        trigger: {
          type: "effectQueued",
          player: "self",
          sourceFilter: { categories: ["event"] },
        },
        effect: {
          type: "moveCards",
          min: 0,
          count: 1,
          from: { player: "self", zone: "donDeck", position: "top" },
          to: { player: "self", zone: "costArea" },
          destinationState: "active",
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:effectQueued",
        "player:self",
        "filter:category:event",
        "activation:event",
        "instruction:moveCards",
        "zone:donDeck",
        "destination:costArea",
        "state:active",
      ]),
    );
  });

  it("parses player-scoped Life-removal reactions independently from DON markers", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [Your Turn] [Once Per Turn] When a card is removed from your opponent's Life cards, draw 2 cards and trash 1 card from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "and" },
        oncePerTurn: true,
        trigger: { type: "lifeRemoved", players: ["opponent"] },
        effect: { type: "sequence" },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "trigger:lifeRemoved",
        "player:opponent",
        "instruction:draw",
        "instruction:trashFromHand",
      ]),
    );
  });

  it("parses field-removal reactions with conditional hand-bottom placement and self-rest follow-up", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When a Character is removed from the field by your effect, if your opponent has 5 or more cards in their hand, your opponent places 1 card from their hand at the bottom of their deck. Then, rest this Character.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: {
          type: "anyOf",
          triggers: [
            {
              type: "fieldRemoved",
              player: "self",
              sourceController: "self",
              sourceKind: "effect",
            },
            {
              type: "fieldRemoved",
              player: "opponent",
              sourceController: "self",
              sourceKind: "effect",
            },
          ],
        },
        effect: { type: "sequence" },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "expression:conditional",
        "condition:handCount",
        "instruction:moveSelected",
        "zone:hand",
        "position:bottom",
        "instruction:rest",
        "target:thisCharacter",
      ]),
    );
  });

  it("parses owner-hand return reactions as destination-filtered field-removal hooks", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When your opponent's Character is returned to the owner's hand by your effect, look at 3 cards from the top of your deck and place them at the top or bottom of the deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: {
          type: "fieldRemoved",
          player: "opponent",
          sourceController: "self",
          sourceKind: "effect",
          destination: "hand",
          filter: { categories: ["character"] },
        },
        effect: {
          type: "placeTopDeckCards",
          count: 3,
          destination: "topOrBottom",
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "player:opponent",
        "destination:hand",
        "filter:category:character",
        "replacementSource:cardEffect",
        "instruction:placeTopDeckCards",
      ]),
    );
  });

  it("parses bare Character K.O. reactions with rested DON attachment to this Leader", () => {
    const result = parseCardEffectLine(
      "[Your Turn] When a Character is K.O.'d, give up to 1 rested DON!! card to this Leader.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        trigger: { type: "anyOf" },
        effect: { type: "sequence" },
      },
    });
    expect(
      containsEffect(result, {
        type: "selectCards",
        zone: "costArea",
        filter: { categories: ["don"], state: "rested" },
      }),
    ).toBe(true);
    expect(containsEffect(result, { type: "attachSelectedDon" })).toBe(true);
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "instruction:attachDon",
        "filter:state:rested",
        "zone:leaderArea",
      ]),
    );
  });

  it("parses field stat modifiers until the start of your next turn through shared duration support", () => {
    const result = parseCardEffectLine(
      "[Your Turn] [Once Per Turn] When a DON!! card on your field is returned to your DON!! deck, this Character gains +2000 power until the start of your next turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: { type: "donReturned", player: "self" },
        effect: {
          type: "modifyPower",
          duration: { type: "untilStartOfNextTurn", player: "self" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:donReturned",
        "instruction:modifyPower",
        "duration:selfNextTurnStart",
      ]),
    );
  });

  it("parses opponent-effect field-removal reactions with type-including Character filters", () => {
    const result = parseCardEffectLine(
      '[Once Per Turn] When your Character with a type including "Roger Pirates" is removed from the field by your opponent\'s effect, add up to 1 DON!! card from your DON!! deck and rest it.',
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        oncePerTurn: true,
        trigger: {
          type: "fieldRemoved",
          player: "self",
          sourceController: "opponent",
          sourceKind: "effect",
          filter: {
            categories: ["character"],
            typesIncludeAny: ["Roger Pirates"],
          },
        },
        effect: {
          type: "moveCards",
          min: 0,
          count: 1,
          from: { player: "self", zone: "donDeck", position: "top" },
          to: { player: "self", zone: "costArea" },
          destinationState: "rested",
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "player:self",
        "filter:category:character",
        "filter:type",
        "replacementSource:opponent",
        "replacementSource:cardEffect",
        "instruction:moveCards",
        "destination:costArea",
        "state:rested",
      ]),
    );
  });

  it("parses controller-agnostic effect field-removal reactions with reusable follow-up bodies", () => {
    const result = parseCardEffectLine(
      '[Your Turn] [Once Per Turn] When your Character with a type including "Whitebeard Pirates" is removed from the field by an effect, draw 1 card. Then, place 1 card from your hand at the top or bottom of your deck.',
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: { type: "yourTurn" },
        oncePerTurn: true,
        trigger: {
          type: "fieldRemoved",
          player: "self",
          sourceKind: "effect",
          filter: {
            categories: ["character"],
            typesIncludeAny: ["Whitebeard Pirates"],
          },
        },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "draw", player: "self", count: 1 } },
            {
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      player: "self",
                      chooser: "self",
                      min: 1,
                      max: 1,
                    },
                  },
                  {
                    effect: {
                      type: "moveSelected",
                      from: "hand",
                      to: "deck",
                      position: "topOrBottom",
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
        "trigger:fieldRemoved",
        "player:self",
        "filter:type",
        "replacementSource:cardEffect",
        "instruction:draw",
        "instruction:moveSelected",
        "zone:hand",
        "zone:deck",
        "position:top",
        "position:bottom",
      ]),
    );
  });

  it("parses another opponent-effect field-removal reaction with the same reusable pieces", () => {
    const result = parseCardEffectLine(
      '[Once Per Turn] When your Character with a type including "Navy" is removed from the field by your opponent\'s effect, add up to 2 DON!! cards from your DON!! deck and rest them.',
    );

    expect(result).toMatchObject({
      block: {
        trigger: {
          type: "fieldRemoved",
          sourceController: "opponent",
          sourceKind: "effect",
          filter: {
            categories: ["character"],
            typesIncludeAny: ["Navy"],
          },
        },
        effect: {
          type: "moveCards",
          count: 2,
          destinationState: "rested",
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "filter:type",
        "replacementSource:opponent",
        "instruction:moveCards",
      ]),
    );
  });

  it("parses variable rest-DON opponent-attack battle power scaling", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [On Your Opponent's Attack] If you have 5 or less active DON!! cards, you may rest any number of your DON!! cards. For every DON!! card rested this way, this Leader or up to 1 of your {Straw Hat Crew} type Characters gains +2000 power during this battle.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        condition: {
          type: "and",
          conditions: [
            { type: "attachedDonCount", value: 1 },
            {
              type: "fieldCount",
              player: "self",
              filter: { categories: ["don"], state: "active" },
              op: "lte",
              value: 5,
            },
          ],
        },
        trigger: { type: "onOpponentAttack" },
        effect: {
          type: "sequence",
          effects: [
            {
              saveResultAs: "paidCost:restDon",
              effect: {
                type: "payCost",
                cost: {
                  type: "restDon",
                  count: 0,
                  maxCount: "available",
                  chooser: "self",
                  optional: true,
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "modifyPower",
                target: {
                  type: "chooseFromZones",
                  request: {
                    player: "self",
                    zones: ["leaderArea", "characterArea"],
                    min: 0,
                    max: 1,
                    filter: {
                      anyOf: [
                        { categories: ["leader"] },
                        {
                          categories: ["character"],
                          typesAny: ["Straw Hat Crew"],
                        },
                      ],
                    },
                  },
                },
                value: {
                  type: "paidCostCardCount",
                  cost: "paidCost:restDon",
                  multiplier: 2000,
                },
                duration: { type: "thisBattle" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "entry:onOpponentAttack",
        "condition:donFieldCount",
        "filter:state:active",
        "cost:restDon",
        "count:anyNumber",
        "instruction:modifyPower",
        "value:dynamic:paidCostCardCount",
        "filter:type",
        "duration:thisBattle",
      ]),
    );
  });

  it("parses another variable rest-DON battle power scaling target type", () => {
    const result = parseCardEffectLine(
      "[On Your Opponent's Attack] If you have 3 or less active DON!! cards, you may rest any number of your DON!! cards. For every DON!! card rested this way, this Leader or up to 1 of your {Navy} type Characters gains +1000 power during this battle.",
    );

    expect(result).toMatchObject({
      block: {
        condition: {
          type: "fieldCount",
          value: 3,
        },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: { type: "restDon", count: 0, maxCount: "available" },
              },
            },
            {
              effect: {
                type: "modifyPower",
                target: {
                  type: "chooseFromZones",
                  request: {
                    filter: {
                      anyOf: [
                        { categories: ["leader"] },
                        { categories: ["character"], typesAny: ["Navy"] },
                      ],
                    },
                  },
                },
                value: {
                  type: "paidCostCardCount",
                  cost: "paidCost:restDon",
                  multiplier: 1000,
                },
              },
            },
          ],
        },
      },
    });
  });
});

function containsEffect(received: unknown, expected: unknown): boolean {
  if (thisEquals(received, expected)) {
    return true;
  }
  if (typeof received !== "object" || received === null) {
    return false;
  }
  if (Array.isArray(received)) {
    return received.some((item) => containsEffect(item, expected));
  }
  return Object.values(received).some((value) =>
    containsEffect(value, expected),
  );
}

function thisEquals(received: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(received) &&
      expected.every((expectedValue, index) =>
        thisEquals(received[index], expectedValue),
      )
    );
  }
  if (!isRecord(expected)) {
    return Object.is(received, expected);
  }
  if (!isRecord(received)) {
    return false;
  }
  return Object.entries(expected).every(([key, expectedValue]) =>
    thisEquals(received[key], expectedValue),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
