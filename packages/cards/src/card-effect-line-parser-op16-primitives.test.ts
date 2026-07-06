import { describe, expect, it } from "vitest";

import {
  parseCardEffectLine,
  parseCardEffectLineDetailed,
} from "./card-effect-line-parser.js";

describe("OP16 reusable primitive parsing", () => {
  it("parses field-trash optional costs independently from K.O. bodies", () => {
    const result = parseCardEffectLine(
      "[On Play] You may trash 1 of your Characters with 10000 base power: K.O. up to 1 of your opponent's Characters with 8000 power or less.",
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
              effect: {
                type: "payCost",
                cost: {
                  type: "trashFromField",
                  count: 1,
                  chooser: "self",
                  optional: true,
                  filter: {
                    categories: ["character"],
                    power: { op: "eq", value: 10000 },
                  },
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "opponent",
                        zone: "characterArea",
                        filter: {
                          categories: ["character"],
                          currentPower: { max: 8000 },
                        },
                      },
                    },
                  },
                  { effect: { type: "ko" } },
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
        "cost:trashFromField",
        "filter:power",
        "filter:currentPower",
        "instruction:ko",
      ]),
    );
  });

  it("parses multi-part optional costs before reusable draw bodies", () => {
    const result = parseCardEffectLine(
      "[Main] You may rest 1 of your DON!! cards and reveal 1 Character card with 8000 power from your hand: Draw 1 card.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: {
                  type: "sequence",
                  optional: true,
                  costs: [
                    { type: "restDon", count: 1, chooser: "self" },
                    {
                      type: "revealFromHand",
                      count: 1,
                      chooser: "self",
                      filter: {
                        categories: ["character"],
                        power: { op: "eq", value: 8000 },
                      },
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
        "entry:eventMain",
        "composition:costSequence",
        "cost:restDon",
        "cost:revealFromHand",
        "instruction:draw",
      ]),
    );
  });

  it("parses named field conditions without binding them to an entry point", () => {
    const result = parseCardEffectLine(
      "[When Attacking] If you have [Antlerkov], play up to 1 Character card with a cost of 2 or less from your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "whenAttacking" },
        condition: {
          type: "fieldCount",
          player: "self",
          filter: { names: ["Antlerkov"] },
          op: "gte",
          value: 1,
        },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "selectCards",
                zone: "hand",
                player: "self",
                filter: {
                  categories: ["character"],
                  cost: { max: 2 },
                },
              },
            },
            { effect: { type: "playSelected" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:fieldCount",
        "filter:name",
        "instruction:playSelected",
      ]),
    );
  });

  it("parses opponent leader rest as a reusable rest primitive", () => {
    const result = parseCardEffectLine(
      "[Trigger] Rest your opponent's Leader.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "trigger" },
        effect: {
          type: "rest",
          target: { type: "opponentLeader" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:lifeTrigger",
        "instruction:rest",
        "target:opponentLeader",
      ]),
    );
  });

  it("parses base-power snapshots when the printed source omits power", () => {
    const result = parseCardEffectLine(
      "[When Attacking] This Character's base power becomes the same as your opponent's Leader during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "whenAttacking" },
        effect: {
          type: "setBasePower",
          target: { type: "self" },
          value: {
            type: "snapshotCardStat",
            target: { type: "opponentLeader" },
            stat: "basePower",
          },
          duration: { type: "thisTurn" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:setBasePower",
        "value:basePower:snapshotBasePower",
      ]),
    );
  });

  it("emits presentation spans for selected base-power snapshots", () => {
    const result = parseCardEffectLineDetailed(
      "[When Attacking] Select up to 1 of your opponent's Characters. This Character's base power becomes the same as the selected Character's power during this turn.",
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        block: {
          category: "auto",
          trigger: { type: "whenAttacking" },
          effect: {
            type: "sequence",
            effects: [
              {
                effect: {
                  type: "selectTargets",
                  request: {
                    player: "opponent",
                    zone: "characterArea",
                    filter: { categories: ["character"] },
                  },
                },
              },
              {
                effect: {
                  type: "setBasePower",
                  target: { type: "self" },
                  value: {
                    type: "snapshotCardStat",
                    stat: "currentPower",
                  },
                  duration: { type: "thisTurn" },
                },
              },
            ],
          },
        },
      },
    });
    if (!result.ok) {
      throw new Error("expected selected base-power snapshot to parse");
    }
    if (result.value.kind === "metadata") {
      throw new Error("expected selected base-power snapshot to be an effect");
    }
    expect(result.value.sourceMap?.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "span:body",
          role: "body",
        }),
      ]),
    );
    expect(result.value.evidence).toEqual(
      expect.arrayContaining([
        "composition:selectThenApply",
        "target:selectedCharacter",
        "value:basePower:snapshotCurrentPower",
      ]),
    );
  });

  it("parses all filtered self Characters activation", () => {
    const result = parseCardEffectLine(
      "[End of Your Turn] Set all of your green Characters with a cost of 5 or less as active.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "endOfYourTurn" },
        effect: {
          type: "activate",
          target: {
            type: "all",
            player: "self",
            zone: "characterArea",
            filter: {
              categories: ["character"],
              colorsAny: ["green"],
              cost: { max: 5 },
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:activate",
        "cardinality:all",
        "filter:color",
        "filter:cost",
      ]),
    );
  });

  it("parses replacement rest-from-field costs separately from K.O. replacement entry points", () => {
    const result = parseCardEffectLine(
      "If this Character would be K.O.'d, you may rest 2 of your cards instead.",
    );

    expect(result).toMatchObject({
      block: {
        category: "replacement",
        effect: {
          type: "replacement",
          when: { type: "wouldBeKOd" },
          instead: {
            type: "rest",
            target: {
              type: "chooseFromZones",
              request: {
                chooser: "self",
                player: "self",
                zones: ["leaderArea", "characterArea", "stageArea", "costArea"],
                min: 2,
                max: 2,
              },
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "replacement:wouldBeKOd",
        "instruction:rest",
        "target:yourCards",
        "cardinality:exact",
      ]),
    );
  });

  it("parses temporary self keyword and power grants behind reusable costs", () => {
    const result = parseCardEffectLine(
      "[On Play] You may trash 1 Character card with 8000 power from your hand: This Character gains [Rush] and +2000 power until the end of your opponent's next End Phase.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: { type: "trashFromHand" },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  { effect: { type: "giveKeyword", keyword: "rush" } },
                  { effect: { type: "modifyPower", value: 2000 } },
                ],
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "cost:trashFromHand",
        "instruction:giveKeyword",
        "keyword:anySupported",
        "instruction:modifyPower",
        "duration:opponentNextEndPhase",
      ]),
    );
  });

  it("parses self K.O. by opponent effect as a reusable field-removal reaction", () => {
    const result = parseCardEffectLine(
      "When this Character is K.O.'d by your opponent's effect, rest up to 1 of your opponent's Characters.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: {
          type: "fieldRemoved",
          target: "self",
          player: "self",
          sourceController: "opponent",
          sourceKind: "effect",
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "trigger:fieldRemoved",
        "target:thisCharacter",
        "instruction:rest",
        "target:opponentCharacters",
      ]),
    );
  });

  it("parses typed Leader-or-Stage rest costs into reusable return bodies", () => {
    const result = parseCardEffectLine(
      "[On K.O.] You may rest 1 of your {Dressrosa} type Leader or Stage cards: Return up to 1 of your opponent's Characters with a cost of 5 or less to the owner's hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onKO" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: {
                  type: "restFromField",
                  count: 1,
                  filter: {
                    categories: ["leader", "stage"],
                    typesAny: ["Dressrosa"],
                  },
                },
              },
            },
            { connector: "ifYouDo" },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "cost:restFromField",
        "filter:type",
        "filter:category:leader",
        "filter:category:stage",
        "instruction:returnToOwnerHand",
      ]),
    );
  });

  it("parses opponent hand-bottom pronouns after reusable conditions", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] You may rest this Character: If your opponent has 8 or more cards in their hand, they place 2 cards from their hand at the bottom of their deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        category: "activate",
        trigger: { type: "activateMain" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "payCost", cost: { type: "restSelf" } } },
            {
              connector: "ifYouDo",
              effect: {
                type: "conditional",
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
        "condition:handCount",
        "instruction:moveSelected",
        "player:opponent",
        "position:bottom",
      ]),
    );
  });

  it("parses named Leader activation through generic activate primitives", () => {
    const result = parseCardEffectLine(
      "[Main] You may rest 2 of your DON!! cards: If your opponent's Character has been K.O.'d during this turn, set your Leader [Yamato] as active.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "payCost", cost: { type: "restDon" } } },
            {
              connector: "ifYouDo",
              effect: {
                type: "conditional",
                then: {
                  type: "activate",
                  target: {
                    type: "all",
                    player: "self",
                    zone: "leaderArea",
                    filter: { categories: ["leader"], names: ["Yamato"] },
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
        "condition:eventHistory",
        "instruction:activate",
        "target:yourLeader",
        "filter:name",
      ]),
    );
  });

  it("parses selected Leader-or-Character base-power setting", () => {
    const result = parseCardEffectLine(
      "[On K.O.] If your Leader has the {Blackbeard Pirates} type, draw 1 card, then up to 1 of your Leader or Character cards' base power becomes 7000 during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onKO" },
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
        },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "draw", count: 1 } },
            {
              effect: {
                type: "setBasePower",
                target: { type: "chooseFromZones" },
                value: 7000,
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:leaderIdentity",
        "instruction:draw",
        "instruction:setBasePower",
        "target:yourLeaderOrCharacters",
      ]),
    );
  });

  it("parses named play from hand-or-trash as a reusable source choice", () => {
    const result = parseCardEffectLine(
      "[On K.O.] Draw 1 card, then play up to 1 [Fullalead] from your hand or trash.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onKO" },
        effect: {
          type: "sequence",
          effects: [
            { effect: { type: "draw", count: 1 } },
            { effect: { type: "choice" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:draw",
        "instruction:playSelected",
        "zone:hand",
        "zone:trash",
        "filter:name",
        "composition:chooseOne",
      ]),
    );
  });

  it("parses multiple named trash plays with shared predicates", () => {
    const result = parseCardEffectLine(
      "[Trigger] If you have 1 or less Life cards, play up to 1 [Absalom], up to 1 [Dr. Hogback], and up to 1 [Perona], with a cost of 4 or less from your trash.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "trigger" },
        condition: {
          type: "lifeCount",
          player: "self",
          op: "lte",
          value: 1,
        },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "selectCards",
                zone: "trash",
                player: "self",
                filter: {
                  names: ["Absalom"],
                  cost: { max: 4 },
                },
              },
            },
            { effect: { type: "playSelected" } },
            {
              effect: {
                type: "selectCards",
                zone: "trash",
                player: "self",
                filter: {
                  names: ["Dr. Hogback"],
                  cost: { max: 4 },
                },
              },
            },
            { effect: { type: "playSelected" } },
            {
              effect: {
                type: "selectCards",
                zone: "trash",
                player: "self",
                filter: {
                  names: ["Perona"],
                  cost: { max: 4 },
                },
              },
            },
            { effect: { type: "playSelected" } },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:lifeCount",
        "instruction:playSelected",
        "zone:trash",
        "filter:name",
        "filter:cost",
        "composition:selectThenPlay",
      ]),
    );
  });
});
