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
});
