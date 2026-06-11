import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser expanded reusable primitive shapes", () => {
  const blockEffect = (result: ReturnType<typeof parseCardEffectLine>) =>
    result !== undefined && "block" in result ? result.block.effect : undefined;

  it("parses activate-main conditional Rush:Character grant without permanent relabeling", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] If your opponent has a Character with 8000 power or more, this Character gains [Rush: Character] during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        oncePerTurn: true,
        condition: {
          type: "fieldCount",
          player: "opponent",
          filter: {
            categories: ["character"],
            currentPower: { min: 8000 },
          },
          op: "gte",
          value: 1,
        },
        effect: {
          type: "giveKeyword",
          target: { type: "self" },
          keyword: "rushCharacter",
          duration: { type: "thisTurn" },
        },
      },
    });
  });

  it("parses comma-bearing OR leader condition into reusable search primitives", () => {
    const result = parseCardEffectLine(
      "[On Play] If your Leader is [Sabo], [Portgas.D.Ace] or [Monkey.D.Luffy], look at 4 cards from the top of your deck; reveal up to 1 card with a cost of 3 or more and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: {
            categories: ["leader"],
            anyOf: [
              { names: ["Sabo"] },
              { names: ["Portgas.D.Ace"] },
              { names: ["Monkey.D.Luffy"] },
            ],
          },
        },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "revealTop", count: 4 } },
            { effect: { type: "selectFromSet", filter: { cost: { min: 3 } } } },
            { effect: { type: "revealSelected" } },
            { effect: { type: "moveSelected", to: "hand" } },
            { effect: { type: "placeSetRemainder", position: "bottom" } },
          ],
        },
      },
    });
  });

  it("parses mixed leader type-or-name condition before leader power modifier", () => {
    const result = parseCardEffectLine(
      "[On Play] If your Leader has the {Red-Haired Pirates} type or is [Uta], your Leader gains +2000 power until the end of your opponent's next End Phase.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: {
            categories: ["leader"],
            anyOf: [{ typesAny: ["Red-Haired Pirates"] }, { names: ["Uta"] }],
          },
        },
        effect: {
          type: "modifyPower",
          target: { type: "myLeader" },
          value: 2000,
          duration: { type: "untilEndOfNextTurn", player: "opponent" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:leaderIdentity",
        "filter:anyOf",
        "filter:type",
        "filter:name",
        "instruction:modifyPower",
        "target:yourLeader",
        "duration:opponentNextEndPhase",
      ]),
    );
  });

  it("parses turn-window leader keyword and power as independent continuous primitives", () => {
    const result = parseCardEffectLine(
      "[Your Turn] Your Leader gains [Double Attack] and +2000 power.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        condition: { type: "yourTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "giveKeyword",
                target: { type: "myLeader" },
                keyword: "doubleAttack",
              },
            },
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: { type: "myLeader" },
                value: 2000,
              },
            },
          ],
        },
      },
    });
  });

  it("parses hand cost reduction with composed leader-name and DON-count conditions", () => {
    const result = parseCardEffectLine(
      'If your Leader\'s card name includes "Ace" and you have 6 or more DON!! cards on your field, give this card in your hand -2 cost.',
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyCost",
          player: "self",
          sourceZone: "hand",
          target: { type: "self" },
          value: -2,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "and",
              conditions: [
                { type: "hasCardInZone" },
                { type: "fieldCount", filter: { categories: ["don"] } },
              ],
            },
          },
        },
      },
    });
  });

  it("parses no-matching-character condition into negative power modifier", () => {
    const result = parseCardEffectLine(
      'If you have no Characters with a type including "Whitebeard Pirates" and a cost of 8 or more, give this Character -4000 power.',
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: -4000,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "fieldCount",
              player: "self",
              filter: {
                categories: ["character"],
                typesIncludeAny: ["Whitebeard Pirates"],
                cost: { min: 8 },
              },
              op: "eq",
              value: 0,
            },
          },
        },
      },
    });
  });

  it("parses forced opponent DON return under different wrappers", () => {
    const onPlay = parseCardEffectLine(
      "[On Play] If your Leader has the {Impel Down} type, your opponent returns 1 DON!! card from their field to their DON!! deck.",
    );
    const onKo = parseCardEffectLine(
      "[On K.O.] Your opponent returns 4 DON!! cards from their field to their DON!! deck.",
    );

    expect(onPlay?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "condition:leaderIdentity",
        "filter:type",
        "instruction:returnDon",
        "player:opponent",
        "count:positiveInteger",
        "expression:conditional",
      ]),
    );
    expect(onKo?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onKO",
        "instruction:returnDon",
        "player:opponent",
        "count:positiveInteger",
      ]),
    );
  });

  it("parses global all-character KO with source exclusion", () => {
    const result = parseCardEffectLine(
      "[When Attacking] DON!! \u221210: K.O. all Characters other than this Character.",
    );

    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:whenAttacking",
        "cost:returnDon",
        "instruction:ko",
        "cardinality:all",
        "player:any",
        "filter:category:character",
        "filter:excludeSelf",
      ]),
    );
  });

  it("parses up-to opponent life top trash as movement, not damage", () => {
    const result = parseCardEffectLine(
      "[When Attacking] Trash up to 1 card from the top of your opponent's Life cards.",
    );

    expect(blockEffect(result)).toMatchObject({
      type: "moveCards",
      min: 0,
      count: 1,
      from: { player: "opponent", zone: "life", position: "top" },
      to: { player: "opponent", zone: "trash" },
      order: "original",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:moveCards",
        "cardinality:upTo",
        "player:opponent",
        "zone:life",
        "destination:trash",
      ]),
    );
    expect(result?.evidence).not.toContain("instruction:damage");
  });

  it("parses selected character current power as a base-power snapshot source", () => {
    const result = parseCardEffectLine(
      "[When Attacking] Select up to 1 of your opponent's Characters. This Character's base power becomes the same as the selected Character's power during this turn.",
    );

    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:whenAttacking",
        "composition:selectThenApply",
        "instruction:setBasePower",
        "target:thisCharacter",
        "target:selectedCharacter",
        "value:basePower:snapshotCurrentPower",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses named K.O. replacement targets through reusable field target filters", () => {
    const result = parseCardEffectLine(
      "[Once Per Turn] If your [Trafalgar Law] would be K.O.'d, you may add 1 card from the top of your Life cards to your hand instead.",
    );

    expect(result).toMatchObject({
      block: {
        category: "replacement",
        oncePerTurn: true,
        trigger: {
          type: "replacement",
          replacement: {
            type: "wouldBeKOd",
            sourceControllerRelation: "any",
            target: {
              type: "all",
              zone: "characterArea",
              player: "self",
              filter: { names: ["Trafalgar Law"] },
            },
          },
        },
        effect: {
          type: "replacement",
          instead: {
            type: "moveCards",
            from: { player: "self", zone: "life", position: "top" },
            to: { player: "self", zone: "hand" },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:replacement",
        "marker:oncePerTurn",
        "replacement:wouldBeKOd",
        "target:yourCharacters",
        "filter:name",
        "instruction:moveCards",
      ]),
    );
  });

  it("parses life comparison conditions independently from activate-main rest effects", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] You may rest this Character: If the number of your Life cards is equal to or less than the number of your opponent's Life cards, rest up to 1 of your opponent's Characters with a cost of 4 or less.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: { type: "payCost", cost: { type: "restSelf" } },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "conditional",
                if: {
                  type: "lifeCountDifference",
                  minuend: { player: "opponent" },
                  subtrahend: { player: "self" },
                  op: "gte",
                  value: 0,
                },
                then: { type: "sequence" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "cost:restSelf",
        "condition:lifeCountDifference",
        "instruction:rest",
      ]),
    );
  });

  it("parses aggregate life-count conditions inside Trigger conjunctions", () => {
    const result = parseCardEffectLine(
      "[Trigger] If your Leader has the {Supernovas} type and you and your opponent have a total of 5 or less Life cards, play this card.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "trigger" },
        condition: {
          type: "and",
          conditions: [
            { type: "hasCardInZone", filter: { typesAny: ["Supernovas"] } },
            {
              type: "lifeCountTotal",
              players: ["self", "opponent"],
              op: "lte",
              value: 5,
            },
          ],
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
        "condition:lifeCountTotal",
        "instruction:playSource",
      ]),
    );
  });

  it("parses rules text name aliases as metadata instead of an effect wrapper", () => {
    const result = parseCardEffectLine(
      "Under the rules of this game, also treat this card's name as [Trafalgar Law] and [Donquixote Rosinante].",
    );

    expect(result).toEqual({
      kind: "metadata",
      metadata: {
        type: "nameAliases",
        names: ["Trafalgar Law", "Donquixote Rosinante"],
      },
      evidence: [
        "metadata:nameAliases",
        "filter:name",
        "filter:name",
        "target:thisCard",
      ],
    });
  });

  it("parses next-use hand play-cost reduction as a consumable modifyCost primitive", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] DON!! \u22121: The next time you play [Trafalgar Law] with a cost of 4 or more from your hand during this turn, the cost will be reduced by 2.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        oncePerTurn: true,
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "payCost", cost: { type: "returnDon" } } },
            {
              connector: "ifYouDo",
              effect: {
                type: "modifyCost",
                player: "self",
                sourceZone: "hand",
                filter: {
                  names: ["Trafalgar Law"],
                  cost: { min: 4 },
                },
                value: -2,
                duration: { type: "thisTurn" },
                usageLimit: {
                  type: "nextMatchingPlay",
                  maxUses: 1,
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
        "marker:oncePerTurn",
        "cost:returnDon",
        "instruction:modifyCost",
        "usageLimit:nextMatchingPlay",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses variable hand-trash paid-count power under multiple attack timings", () => {
    const lines = [
      "[When Attacking] You may trash any number of Event or Stage cards from your hand. This Leader gains +1000 power during this battle for every card trashed.",
      "[On Your Opponent's Attack] You may trash any number of Event or Stage cards from your hand. This Leader gains +1000 power during this battle for every card trashed.",
    ];

    for (const line of lines) {
      const result = parseCardEffectLine(line);

      expect(result).toMatchObject({
        block: {
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
                    count: 0,
                    maxCount: "available",
                    chooser: "self",
                    filter: { categories: ["event", "stage"] },
                    optional: true,
                  },
                },
              },
              {
                connector: "ifYouDo",
                effect: {
                  type: "modifyPower",
                  target: { type: "self" },
                  value: {
                    type: "paidCostCardCount",
                    cost: "paidCost:trashFromHand",
                    multiplier: 1000,
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
          "cost:trashFromHand",
          "count:anyNumber",
          "filter:category:event",
          "filter:category:stage",
          "instruction:modifyPower",
          "value:dynamic:paidCostCardCount",
          "duration:thisBattle",
        ]),
      );
    }
  });

  it("parses activated-this-turn Event conditions independently from draw bodies", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] [Once Per Turn] If you have activated an Event with a base cost of 3 or more during this turn, draw 1 card.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        oncePerTurn: true,
        condition: {
          type: "eventHistory",
          event: "cardPlayed",
          player: "self",
          filter: {
            categories: ["event"],
            baseCost: { op: "gte", value: 3 },
          },
          window: "thisTurn",
          op: "gte",
          value: 1,
        },
        effect: { type: "draw", count: 1, player: "self" },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:eventHistory",
        "event:cardPlayed",
        "filter:category:event",
        "filter:baseCost",
        "duration:thisTurn",
        "instruction:draw",
      ]),
    );
  });
});
