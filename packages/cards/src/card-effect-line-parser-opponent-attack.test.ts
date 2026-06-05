import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("opponent attack effect line parser", () => {
  it("parses opponent-attack once-per-turn rest-DON cost into opponent Leader or Character rest primitives", () => {
    const result = parseCardEffectLine(
      "[On Your Opponent's Attack] [Once Per Turn] You may rest 1 of your DON!! cards: Rest up to 1 of your opponent's Leader or Character cards.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onOpponentAttack" },
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
                type: "rest",
                target: {
                  type: "chooseFromZones",
                  request: {
                    chooser: "self",
                    player: "opponent",
                    zones: ["leaderArea", "characterArea"],
                    min: 0,
                    max: 1,
                    filter: {
                      categories: ["leader", "character"],
                    },
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
        "entry:onOpponentAttack",
        "marker:oncePerTurn",
        "composition:optionalCostedEffect",
        "cost:restDon",
        "instruction:rest",
        "cardinality:upTo",
        "target:opponentLeaderOrCharacters",
        "filter:category:leader",
        "filter:category:character",
      ]),
    );
  });

  it("parses opponent-attack trash-this-character cost into reusable DON activation primitives", () => {
    const result = parseCardEffectLine(
      "[On Your Opponent's Attack] You may trash this Character: Set up to 1 of your DON!! cards as active.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onOpponentAttack" },
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
                  type: "trashSelf",
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
                    saveResultAs: "targetSelection:set-don-active",
                    effect: {
                      type: "selectTargets",
                      request: {
                        chooser: "self",
                        player: "self",
                        zone: "costArea",
                        min: 0,
                        max: 1,
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
        "entry:onOpponentAttack",
        "composition:optionalCostedEffect",
        "cost:trashSelf",
        "target:thisCharacter",
        "instruction:activate",
        "target:yourDonCards",
        "filter:category:don",
        "filter:state:rested",
        "state:active",
      ]),
    );
  });

  it("parses opponent-attack rest-stage plus filtered hand-trash cost into battle power primitives", () => {
    const result = parseCardEffectLine(
      "[On Your Opponent's Attack] You may rest this Stage and trash 1 Event or Stage card from your hand: Up to 1 of your Leader or Character cards gains +2000 power during this battle.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onOpponentAttack" },
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
                    {
                      type: "trashFromHand",
                      count: 1,
                      chooser: "self",
                      filter: {
                        anyOf: [
                          { categories: ["event"] },
                          { categories: ["stage"] },
                        ],
                      },
                    },
                  ],
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
                    timing: "onResolution",
                    chooser: "self",
                    player: "self",
                    zones: ["leaderArea", "characterArea"],
                    min: 0,
                    max: 1,
                    allowFewerIfUnavailable: true,
                    visibility: "public",
                    filter: {
                      categories: ["leader", "character"],
                    },
                  },
                },
                value: 2000,
                duration: { type: "thisBattle" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onOpponentAttack",
        "composition:optionalCostedEffect",
        "composition:costSequence",
        "cost:restSelf",
        "cost:trashFromHand",
        "filter:anyOf",
        "filter:category:event",
        "filter:category:stage",
        "instruction:modifyPower",
        "target:yourLeaderOrCharacters",
        "duration:thisBattle",
      ]),
    );
  });
});
