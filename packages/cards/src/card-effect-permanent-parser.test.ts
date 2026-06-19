import { describe, expect, it } from "vitest";

import {
  parseCardEffectLine,
  parseCardEffectLines,
} from "./card-effect-line-parser.js";

describe("permanent card effect line parser", () => {
  it("parses opponent leader attribute condition before continuous leader power gain", () => {
    const result = parseCardEffectLine(
      "If your opponent's Leader has the <Slash> attribute, this Leader gains +1000 power.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyPower",
          target: { type: "myLeader" },
          value: 1000,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "hasCardInZone",
              zone: "leaderArea",
              player: "opponent",
              filter: { categories: ["leader"], attributesAny: ["slash"] },
            },
          },
        },
      },
    });
    for (const evidence of [
      "condition:leaderIdentity",
      "player:opponent",
      "filter:attribute",
      "instruction:modifyPower",
      "target:yourLeader",
      "duration:whileConditionTrue",
    ] as const) {
      expect(result?.evidence).toContain(evidence);
    }
  });

  it("parses apply-each trash thresholds as independent continuous conditionals", () => {
    const result = parseCardEffectLine(
      [
        "Apply each of the following effects based on the number of cards in your trash:",
        "• If there are 10 or more cards, this Character's base power becomes 9000 and it gains +10 cost.",
        "• If you have 20 or more cards, during your opponent's turn, your Leader's base power becomes 7000.",
        "• If you have 30 or more cards, this Character gains +1000 power.",
      ].join("\n"),
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
                type: "setBasePower",
                target: { type: "self" },
                value: 9000,
                duration: {
                  type: "whileConditionTrue",
                  condition: {
                    type: "trashCount",
                    player: "self",
                    op: "gte",
                    value: 10,
                  },
                },
              },
            },
            {
              connector: "always",
              effect: {
                type: "modifyCost",
                target: { type: "self" },
                value: 10,
                duration: {
                  type: "whileConditionTrue",
                  condition: {
                    type: "trashCount",
                    player: "self",
                    op: "gte",
                    value: 10,
                  },
                },
              },
            },
            {
              connector: "always",
              effect: {
                type: "setBasePower",
                target: { type: "myLeader" },
                value: 7000,
                duration: {
                  type: "whileConditionTrue",
                  condition: {
                    type: "and",
                    conditions: [
                      {
                        type: "trashCount",
                        player: "self",
                        op: "gte",
                        value: 20,
                      },
                      { type: "opponentTurn" },
                    ],
                  },
                },
              },
            },
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: { type: "self" },
                value: 1000,
                duration: {
                  type: "whileConditionTrue",
                  condition: {
                    type: "trashCount",
                    player: "self",
                    op: "gte",
                    value: 30,
                  },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "composition:applyEach",
        "expression:conditionalContinuous",
        "composition:conditionAnd",
        "condition:trashCount",
        "condition:opponentTurn",
        "instruction:setBasePower",
        "instruction:modifyCost",
        "instruction:modifyPower",
        "target:thisCharacter",
        "target:yourLeader",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it("parses apply-each trash thresholds after gameplay line grouping", () => {
    const results = parseCardEffectLines(
      [
        "Apply each of the following effects based on the number of cards in your trash:",
        "\u2022 If there are 10 or more cards, this Character's base power becomes 9000 and it gains +10 cost.",
        "\u2022 If you have 20 or more cards, during your opponent's turn, your Leader's base power becomes 7000.",
        "\u2022 If you have 30 or more cards, this Character gains +1000 power.",
      ].join("\n"),
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "setBasePower", target: { type: "self" } } },
            { effect: { type: "modifyCost", target: { type: "self" } } },
            {
              effect: { type: "setBasePower", target: { type: "myLeader" } },
            },
            { effect: { type: "modifyPower", target: { type: "self" } } },
          ],
        },
      },
    });
  });

  it("parses implicit permanent named-card and self keyword grants as reusable primitives", () => {
    const result = parseCardEffectLine(
      "All of your [Ohm] cards and this Character gain [Double Attack].",
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
                type: "giveKeyword",
                target: {
                  type: "all",
                  zone: "characterArea",
                  player: "self",
                  filter: { categories: ["character"], names: ["Ohm"] },
                },
                keyword: "doubleAttack",
                duration: { type: "whileSourceOnField" },
              },
            },
            {
              connector: "always",
              effect: {
                type: "giveKeyword",
                target: { type: "self" },
                keyword: "doubleAttack",
                duration: { type: "whileSourceOnField" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "instruction:giveKeyword",
        "filter:name",
        "filter:category:character",
        "target:thisCharacter",
        "keyword:anySupported",
      ]),
    );
  });

  it("parses Opponent's Turn named-card and self base power as reusable continuous primitives", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] All of your [Ohm] cards' base power and this Character's base power become 6000.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        condition: { type: "opponentTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "setBasePower",
                target: {
                  type: "all",
                  zone: "characterArea",
                  player: "self",
                  filter: { categories: ["character"], names: ["Ohm"] },
                },
                value: 6000,
                duration: {
                  type: "whileConditionTrue",
                  condition: { type: "opponentTurn" },
                },
              },
            },
            {
              connector: "always",
              effect: {
                type: "setBasePower",
                target: { type: "self" },
                value: 6000,
                duration: {
                  type: "whileConditionTrue",
                  condition: { type: "opponentTurn" },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:opponentTurn",
        "condition:opponentTurn",
        "instruction:setBasePower",
        "filter:name",
        "filter:category:character",
        "target:thisCharacter",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it("parses conditional base power copied from your Leader as a reusable snapshot value", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] If you have 7 or less cards in your hand, this Character's base power becomes the same as your Leader's base power.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        condition: { type: "opponentTurn" },
        effect: {
          type: "setBasePower",
          target: { type: "self" },
          value: {
            type: "snapshotCardStat",
            target: { type: "myLeader" },
            stat: "currentPower",
          },
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "and",
              conditions: [
                { type: "opponentTurn" },
                {
                  type: "handCount",
                  player: "self",
                  op: "lte",
                  value: 7,
                },
              ],
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:opponentTurn",
        "condition:opponentTurn",
        "condition:handCount",
        "expression:conditionalContinuous",
        "composition:conditionAnd",
        "instruction:setBasePower",
        "target:thisCharacter",
        "target:yourLeader",
        "value:basePower:snapshotCurrentPower",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it("parses implicit permanent named-card-only keyword grants", () => {
    const result = parseCardEffectLine("Your [Blugori] gains [Blocker].");

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "giveKeyword",
          target: {
            type: "all",
            zone: "characterArea",
            player: "self",
            filter: { categories: ["character"], names: ["Blugori"] },
          },
          keyword: "blocker",
          duration: { type: "whileSourceOnField" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "instruction:giveKeyword",
        "filter:name",
        "keyword:anySupported",
      ]),
    );
  });

  it("parses implicit permanent all-field filtered keyword grants", () => {
    const result = parseCardEffectLine(
      "All of your red Characters with a cost of 3 or more other than this Character gain [Rush].",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "giveKeyword",
          target: {
            type: "all",
            zone: "characterArea",
            player: "self",
            filter: {
              colorsAny: ["red"],
              categories: ["character"],
              cost: { min: 3 },
              excludeSelf: true,
            },
          },
          keyword: "rush",
          duration: { type: "whileSourceOnField" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "instruction:giveKeyword",
        "filter:color",
        "filter:cost",
        "filter:excludeSelf",
        "keyword:anySupported",
      ]),
    );
  });

  it("parses Opponent's Turn rest protection and keyword grant as reusable continuous primitives", () => {
    const result = parseCardEffectLine(
      "[Opponent's Turn] This Character cannot be rested by your opponent's Leader and Character effects and gains [Blocker].",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        condition: { type: "opponentTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "giveProtection",
                target: { type: "self" },
                protection: {
                  process: "rest",
                  sourceKind: "cardEffect",
                  sourceControllerRelation: "opponentControlled",
                  sourceCardCategories: ["leader", "character"],
                },
                duration: {
                  type: "whileConditionTrue",
                  condition: { type: "opponentTurn" },
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
                  condition: { type: "opponentTurn" },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:opponentTurn",
        "condition:opponentTurn",
        "instruction:giveProtection",
        "protectionProcess:rest",
        "protectionSource:opponentCardCategoryEffects",
        "sourceCategory:leader",
        "sourceCategory:character",
        "instruction:giveKeyword",
        "keyword:anySupported",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it("parses attached DON keyword grants as marker conditions plus reusable keyword primitives", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] This Character gains [Blocker].",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        condition: {
          type: "attachedDonCount",
          target: { type: "self" },
          op: "gte",
          value: 1,
        },
        effect: {
          type: "giveKeyword",
          target: { type: "self" },
          keyword: "blocker",
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "attachedDonCount",
              target: { type: "self" },
              op: "gte",
              value: 1,
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "condition:attachedDonCount",
        "entry:implicitPermanent",
        "instruction:giveKeyword",
        "target:thisCharacter",
        "keyword:anySupported",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it.each([
    ["This Leader cannot attack.", "target:thisCard"],
    ["This Character cannot attack.", "target:thisCharacter"],
  ])("parses permanent self attack restriction: %s", (text, targetEvidence) => {
    const result = parseCardEffectLine(text);

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "cannotAttack",
          target: { type: "self" },
          duration: { type: "whileSourceOnField" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "instruction:preventActivation",
        targetEvidence,
        "duration:whileSourceOnField",
      ]),
    );
  });

  it("parses attached DON keyword grants without coupling to Blocker", () => {
    const result = parseCardEffectLine(
      "[DON!! x2] This Character gains [Rush].",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        condition: {
          type: "attachedDonCount",
          target: { type: "self" },
          op: "gte",
          value: 2,
        },
        effect: {
          type: "giveKeyword",
          keyword: "rush",
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "attachedDonCount",
              target: { type: "self" },
              op: "gte",
              value: 2,
            },
          },
        },
      },
    });
  });

  it("parses attached-DON conditional all-field power gains", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] If you have a Character with a cost of 8 or more, your Leader and all of your Characters gain +1000 power.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        condition: {
          type: "attachedDonCount",
          target: { type: "self" },
          op: "gte",
          value: 1,
        },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "modifyPower",
                target: { type: "myLeader" },
                value: 1000,
                duration: {
                  type: "whileConditionTrue",
                  condition: {
                    type: "and",
                    conditions: [
                      {
                        type: "attachedDonCount",
                        target: { type: "self" },
                        op: "gte",
                        value: 1,
                      },
                      {
                        type: "fieldCount",
                        player: "self",
                        filter: {
                          categories: ["character"],
                          cost: { min: 8 },
                        },
                        op: "gte",
                        value: 1,
                      },
                    ],
                  },
                },
              },
            },
            {
              effect: {
                type: "modifyPower",
                target: {
                  type: "all",
                  player: "self",
                  zone: "characterArea",
                  filter: { categories: ["character"] },
                },
                value: 1000,
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
        "expression:conditionalContinuous",
        "composition:conditionAnd",
        "condition:fieldCount",
        "filter:category:character",
        "filter:cost",
        "instruction:modifyPower",
        "target:yourLeader",
        "cardinality:all",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it("parses leader identity and state conditions as reusable filter predicates", () => {
    const result = parseCardEffectLine(
      "If your Leader has the {Dressrosa} type and is active, this Character gains +2000 power.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: 2000,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "hasCardInZone",
              zone: "leaderArea",
              player: "self",
              filter: {
                categories: ["leader"],
                typesAny: ["Dressrosa"],
                state: "active",
              },
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "condition:leaderIdentity",
        "filter:type",
        "filter:state:active",
        "instruction:modifyPower",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it("parses attached-DON conditional all-field power gains with another threshold", () => {
    const result = parseCardEffectLine(
      "[DON!! x2] If you have a Character with a cost of 6 or more, your Leader and all of your Characters gain +2000 power.",
    );

    expect(result).toMatchObject({
      block: {
        condition: {
          type: "attachedDonCount",
          value: 2,
        },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "modifyPower", value: 2000 } },
            { effect: { type: "modifyPower", value: 2000 } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "composition:conditionAnd",
        "filter:cost",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it("parses relative DON-count self hand cost reduction as reusable primitives", () => {
    const result = parseCardEffectLine(
      "If the number of DON!! cards on your field is at least 2 less than the number on your opponent's field, give this card in your hand −3 cost.",
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
          value: -3,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "fieldCountDifference",
              minuend: {
                player: "opponent",
                filter: { categories: ["don"] },
              },
              subtrahend: {
                player: "self",
                filter: { categories: ["don"] },
              },
              op: "gte",
              value: 2,
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "condition:fieldCountDifference",
        "player:opponent",
        "player:self",
        "instruction:modifyCost",
        "target:thisCard",
        "zone:hand",
        "modifier:costReduction",
      ]),
    );
  });

  it("parses attached DON filtered hand cost reduction as reusable primitives", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] Give blue Events in your hand -1 cost.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyCost",
          player: "self",
          sourceZone: "hand",
          filter: { colorsAny: ["blue"], categories: ["event"] },
          value: -1,
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "attachedDonCount",
              target: { type: "self" },
              op: "gte",
              value: 1,
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "marker:attachedDon",
        "condition:attachedDonCount",
        "instruction:modifyCost",
        "filter:color",
        "filter:category:event",
        "zone:hand",
        "modifier:costReduction",
        "duration:whileConditionTrue",
      ]),
    );
  });

  it("parses filtered trash-count self power and cost gains as reusable primitives", () => {
    const result = parseCardEffectLine(
      "If you have 4 or more Events in your trash, this Character gains +2000 power and +5 cost.",
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
                type: "modifyPower",
                target: { type: "self" },
                value: 2000,
                duration: {
                  type: "whileConditionTrue",
                  condition: {
                    type: "trashCount",
                    player: "self",
                    filter: { categories: ["event"] },
                    op: "gte",
                    value: 4,
                  },
                },
              },
            },
            {
              connector: "always",
              effect: {
                type: "modifyCost",
                target: { type: "self" },
                value: 5,
                duration: {
                  type: "whileConditionTrue",
                  condition: {
                    type: "trashCount",
                    player: "self",
                    filter: { categories: ["event"] },
                    op: "gte",
                    value: 4,
                  },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "condition:trashCount",
        "filter:category:event",
        "instruction:modifyPower",
        "instruction:modifyCost",
        "target:thisCharacter",
        "modifier:positivePower",
        "modifier:positiveCost",
      ]),
    );
  });

  it("parses durationless all-opponent power reduction as a permanent continuous modifier", () => {
    const result = parseCardEffectLine(
      "Give all of your opponent's Characters -1000 power.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyPower",
          target: {
            type: "all",
            zone: "characterArea",
            player: "opponent",
            filter: { categories: ["character"] },
          },
          value: -1000,
          duration: { type: "whileSourceOnField" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "instruction:modifyPower",
        "cardinality:all",
        "player:opponent",
        "zone:characterArea",
        "filter:category:character",
        "modifier:negativePower",
        "duration:whileSourceOnField",
      ]),
    );
  });

  it("parses continuous effect invalidation over your Leader and filtered Characters", () => {
    const result = parseCardEffectLine(
      'Your Leader and all of your Characters that do not have a type including "Roger Pirates" have their effects negated.',
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
                type: "invalidateEffects",
                target: { type: "myLeader" },
                duration: { type: "whileSourceOnField" },
              },
            },
            {
              connector: "always",
              effect: {
                type: "invalidateEffects",
                target: {
                  type: "all",
                  player: "self",
                  zone: "characterArea",
                  filter: {
                    categories: ["character"],
                    typesNotIncludeAny: ["Roger Pirates"],
                  },
                },
                duration: { type: "whileSourceOnField" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "instruction:invalidateEffects",
        "target:yourLeader",
        "target:yourCharacters",
        "cardinality:all",
        "filter:category:character",
        "filter:type",
        "duration:whileSourceOnField",
        "composition:sequence",
      ]),
    );
  });

  it("parses rested DON batches as the same dynamic zone-count value primitive", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [Your Turn] This Character gains +1000 power for every 3 of your rested DON!! cards.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: {
            type: "countMatchingZoneCards",
            player: "self",
            zone: "costArea",
            filter: { categories: ["don"], state: "rested" },
            per: 3,
            multiplier: 1000,
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "marker:attachedDon",
        "entry:yourTurn",
        "instruction:modifyPower",
        "target:thisCharacter",
        "modifier:positivePower",
        "value:dynamic:matchingZoneCards",
        "zone:costArea",
        "filter:category:don",
        "filter:state:rested",
      ]),
    );
  });
});
