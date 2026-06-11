import { describe, expect, it } from "vitest";

import {
  preventOpponentCharactersRefreshPrimitive,
  preventOpponentCharactersRestPrimitive,
  preventOpponentCharactersAttackPrimitive,
  preventThatCharacterRefreshPrimitive,
  parsePreventOpponentCharactersAttackInstruction,
  parsePreventOpponentCharactersBlockerActivationInstruction,
  parsePreventOpponentCharactersRefreshInstruction,
  parsePreventOpponentCharactersRestInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseRestOpponentCardsInstruction,
  parseRestOpponentCharactersOrDonCardsInstruction,
  parseRestOpponentCharactersInstruction,
  parseRestOpponentDonCardsInstruction,
  parseRestThisCharacterAndOpponentCharactersInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
  restOpponentCardsPrimitive,
  restOpponentCharactersOrDonCardsPrimitive,
  restOpponentCharactersPrimitive,
  restOpponentDonCardsPrimitive,
  restThisCharacterAndOpponentCharactersPrimitive,
  yourLeaderPowerOpponentNextEndPrimitive,
} from "./planned-field-effects.js";

describe("planned field-effect instruction parsers", () => {
  it("defines field-effect instructions as primitive parents with match families", () => {
    expect(restOpponentCharactersPrimitive).toEqual({
      primitiveId: "instruction:rest",
      childPrimitiveIds: ["cardinality:upTo", "target:opponentCharacters"],
    });
    expect(restOpponentCardsPrimitive).toEqual({
      primitiveId: "instruction:rest",
      childPrimitiveIds: ["cardinality:upTo", "target:opponentCards"],
    });
    expect(restOpponentCharactersOrDonCardsPrimitive).toEqual({
      primitiveId: "instruction:rest",
      childPrimitiveIds: [
        "cardinality:upTo",
        "target:opponentCharactersOrDonCards",
      ],
    });
    expect(restOpponentDonCardsPrimitive).toEqual({
      primitiveId: "instruction:rest",
      childPrimitiveIds: ["cardinality:upTo", "target:opponentDonCards"],
    });
    expect(restThisCharacterAndOpponentCharactersPrimitive).toEqual({
      primitiveId: "instruction:rest",
      childPrimitiveIds: [
        "target:thisCharacter",
        "cardinality:upTo",
        "target:opponentCharacters",
        "composition:sequence",
      ],
    });
    expect(preventThatCharacterRefreshPrimitive).toEqual({
      primitiveId: "instruction:preventActivation",
      childPrimitiveIds: [
        "reference:thatCharacter",
        "duration:opponentNextRefreshPhase",
        "duration:thisTurn",
      ],
    });
    expect(preventOpponentCharactersRefreshPrimitive).toEqual({
      primitiveId: "instruction:preventActivation",
      childPrimitiveIds: [
        "cardinality:all",
        "cardinality:upTo",
        "target:opponentCharacters",
        "target:opponentRestedCards",
        "duration:opponentNextRefreshPhase",
        "duration:thisTurn",
      ],
    });
    expect(preventOpponentCharactersRestPrimitive).toEqual({
      primitiveId: "instruction:giveProtection",
      childPrimitiveIds: [
        "cardinality:upTo",
        "target:opponentCharacters",
        "protectionProcess:rest",
        "duration:opponentNextEndPhase",
        "duration:thisTurn",
      ],
    });
    expect(preventOpponentCharactersAttackPrimitive).toEqual({
      primitiveId: "instruction:preventActivation",
      childPrimitiveIds: [
        "cardinality:upTo",
        "target:opponentCharacters",
        "duration:opponentNextEndPhase",
        "duration:thisTurn",
      ],
    });
    expect(yourLeaderPowerOpponentNextEndPrimitive).toEqual({
      primitiveId: "instruction:modifyPower",
      childPrimitiveIds: [
        "target:yourLeader",
        "modifier:positivePower",
        "duration:opponentNextEndPhase",
      ],
    });
  });

  it("parses rest opponent Characters or DON cards as one shared mixed-zone target selection", () => {
    expect(
      parseRestOpponentCharactersOrDonCardsInstruction({
        text: "Rest up to a total of 2 of your opponent's Characters or DON!! cards.",
      }),
    ).toEqual({
      effect: {
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zones: ["characterArea", "costArea"],
            filter: { categories: ["character", "don"] },
            min: 0,
            max: 2,
            allowFewerIfUnavailable: true,
            visibility: "public",
          },
        },
      },
      evidence: [
        "instruction:rest",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:opponentCharactersOrDonCards",
        "player:opponent",
        "zone:characterArea",
        "zone:costArea",
        "filter:category:character",
        "filter:category:don",
      ],
      rest: "",
    });
  });

  it("parses rest opponent DON cards as a reusable cost-area target selection", () => {
    expect(
      parseRestOpponentDonCardsInstruction({
        text: "Rest up to 1 of your opponent's DON!! cards.",
      }),
    ).toEqual({
      effect: {
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zones: ["costArea"],
            filter: { categories: ["don"] },
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
          },
        },
      },
      evidence: [
        "instruction:rest",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:opponentDonCards",
        "player:opponent",
        "zone:costArea",
        "filter:category:don",
      ],
      rest: "",
    });
  });

  it("parses rest this Character and opponent Characters as reusable rest sequence", () => {
    expect(
      parseRestThisCharacterAndOpponentCharactersInstruction({
        text: "Rest this Character and up to 1 of your opponent's Characters.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "rest",
              target: { type: "self" },
            },
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
                      filter: { categories: ["character"] },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "rest",
                    target: { type: "savedFieldObject" },
                  },
                },
              ],
            },
          },
        ],
      },
      evidence: [
        "instruction:rest",
        "target:thisCharacter",
        "instruction:rest",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "composition:sequence",
      ],
      rest: "",
    });
  });

  it("parses rest opponent public field cards as a reusable field-card target selection", () => {
    expect(
      parseRestOpponentCardsInstruction({
        text: "Rest up to 1 of your opponent's cards.",
      }),
    ).toEqual({
      effect: {
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zones: ["leaderArea", "characterArea", "stageArea", "costArea"],
            filter: { categories: ["leader", "character", "stage", "don"] },
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
          },
        },
      },
      evidence: [
        "instruction:rest",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:opponentCards",
        "player:opponent",
        "zone:leaderArea",
        "zone:characterArea",
        "zone:stageArea",
        "zone:costArea",
        "filter:category:leader",
        "filter:category:character",
        "filter:category:stage",
        "filter:category:don",
      ],
      rest: "",
    });
  });

  it("parses rest opponent Characters as target selection plus rest primitives", () => {
    expect(
      parseRestOpponentCharactersInstruction({
        text: "Rest up to 1 of your opponent's Characters",
      }),
    ).toEqual({
      effect: {
        type: "sequence",
        effects: [
          {
            id: "select:that-character",
            connector: "always",
            saveResultAs: "selected:thatCharacter",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "opponent",
                zone: "characterArea",
                filter: { categories: ["character"] },
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "rest",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "selected:thatCharacter",
                },
                zone: "characterArea",
                player: "opponent",
                visibility: "publicOnly",
                onFailure: "failClosed",
              },
            },
          },
        ],
      },
      evidence: [
        "instruction:rest",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
      ],
      rest: "",
    });
  });

  it("keeps wording variants inside the same rest primitive", () => {
    const plural = parseRestOpponentCharactersInstruction({
      text: "Rest up to 1 of your opponent's Characters",
    });
    const singular = parseRestOpponentCharactersInstruction({
      text: "Rest up to 1 of your opponent's Character",
    });

    expect(singular).toEqual(plural);
  });

  it("parses filtered rest opponent Characters with trailing punctuation", () => {
    expect(
      parseRestOpponentCharactersInstruction({
        text: "Rest up to 1 of your opponent's Characters with 5000 power or less.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 1,
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
      evidence: [
        "instruction:rest",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "filter:currentPower",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses opponent Character rest with a dynamic Life-count cost predicate", () => {
    expect(
      parseRestOpponentCharactersInstruction({
        text: "Rest up to 1 of your opponent's Characters with a cost equal to or less than the number of your opponent's Life cards.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  statComparisons: [
                    {
                      stat: "cost",
                      op: "lte",
                      value: {
                        type: "countMatchingZoneCards",
                        player: "opponent",
                        zone: "life",
                        per: 1,
                        multiplier: 1,
                      },
                    },
                  ],
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
      evidence: [
        "instruction:rest",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "valueSource:lifeCount:opponent",
      ],
      rest: "",
    });
  });

  it("parses the selected Character refresh lock as a saved-target restriction", () => {
    expect(
      parsePreventThatCharacterRefreshInstruction({
        text: "that Character will not become active in your opponent's next Refresh Phase.",
      }),
    ).toEqual({
      effect: {
        type: "cannotBecomeActive",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: "selected:thatCharacter",
          },
          zone: "characterArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
        duration: { type: "untilStartOfNextTurn", player: "opponent" },
      },
      evidence: [
        "instruction:preventActivation",
        "reference:thatCharacter",
        "target:thatCharacter",
        "duration:opponentNextRefreshPhase",
      ],
      rest: "",
    });
  });

  it("parses direct opponent Character refresh locks as target selection plus duration primitives", () => {
    expect(
      parsePreventOpponentCharactersRefreshInstruction({
        text: "up to 1 of your opponent's rested Characters with 6000 power or less will not become active in your opponent's next Refresh Phase.",
      }),
    ).toEqual({
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
        duration: { type: "untilStartOfNextTurn", player: "opponent" },
      },
      evidence: [
        "instruction:preventActivation",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:state:rested",
        "filter:category:character",
        "filter:currentPower",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "duration:opponentNextRefreshPhase",
      ],
      rest: "",
    });
  });

  it("parses direct opponent Character refresh locks during this turn", () => {
    expect(
      parsePreventOpponentCharactersRefreshInstruction({
        text: "up to 1 of your opponent's rested Characters will not become active during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "cannotBecomeActive",
        target: {
          type: "choose",
          request: {
            player: "opponent",
            zone: "characterArea",
            min: 0,
            max: 1,
            filter: {
              categories: ["character"],
              state: "rested",
            },
          },
        },
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:preventActivation",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:state:rested",
        "filter:category:character",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });

  it("parses opponent rested cards refresh locks as a mixed public-zone selection", () => {
    expect(
      parsePreventOpponentCharactersRefreshInstruction({
        text: "Up to 2 of your opponent's rested cards will not become active in your opponent's next Refresh Phase.",
      }),
    ).toEqual({
      effect: {
        type: "cannotBecomeActive",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zones: ["leaderArea", "characterArea", "stageArea", "costArea"],
            filter: {
              categories: ["leader", "character", "stage", "don"],
              state: "rested",
            },
            min: 0,
            max: 2,
            allowFewerIfUnavailable: true,
            visibility: "public",
          },
        },
        duration: { type: "untilStartOfNextTurn", player: "opponent" },
      },
      evidence: [
        "instruction:preventActivation",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:opponentRestedCards",
        "player:opponent",
        "zone:leaderArea",
        "zone:characterArea",
        "zone:stageArea",
        "zone:costArea",
        "filter:category:leader",
        "filter:category:character",
        "filter:category:stage",
        "filter:category:don",
        "filter:state:rested",
        "duration:opponentNextRefreshPhase",
      ],
      rest: "",
    });
  });

  it("parses all opponent Character refresh locks through the same prevent-activation primitive", () => {
    expect(
      parsePreventOpponentCharactersRefreshInstruction({
        text: "All of your opponent's rested Characters with a cost of 7 or less will not become active in your opponent's next Refresh Phase.",
      }),
    ).toEqual({
      effect: {
        type: "cannotBecomeActive",
        target: {
          type: "all",
          player: "opponent",
          zone: "characterArea",
          filter: {
            categories: ["character"],
            state: "rested",
            cost: { max: 7 },
          },
        },
        duration: { type: "untilStartOfNextTurn", player: "opponent" },
      },
      evidence: [
        "instruction:preventActivation",
        "cardinality:all",
        "player:opponent",
        "target:opponentCharacters",
        "filter:state:rested",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "duration:opponentNextRefreshPhase",
      ],
      rest: "",
    });
  });

  it("parses opponent active Character attack restrictions with this-turn duration", () => {
    expect(
      parsePreventOpponentCharactersAttackInstruction({
        text: "up to 1 of your opponent's active Characters cannot attack during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "selected:thatCharacter",
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  state: "active",
                },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "cannotAttack",
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
      evidence: [
        "instruction:preventActivation",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:state:active",
        "filter:category:character",
        "duration:thisTurn",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });

  it("parses direct opponent Character Blocker activation restrictions", () => {
    expect(
      parsePreventOpponentCharactersBlockerActivationInstruction({
        text: "Up to 1 of your opponent's Characters cannot activate [Blocker] during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "selected:thatCharacter",
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "preventBlockerActivation",
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
      evidence: [
        "instruction:preventBlockerActivation",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "duration:thisTurn",
        "activation:blocker",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });

  it("parses opponent-owned Blocker activation wording into the same saved-target restriction", () => {
    expect(
      parsePreventOpponentCharactersBlockerActivationInstruction({
        text: "Your opponent cannot activate up to 1 [Blocker] Character that has 4000 power or less during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "selected:thatCharacter",
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  currentPower: { max: 4000 },
                },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "preventBlockerActivation",
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
      evidence: [
        "instruction:preventBlockerActivation",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "filter:currentPower",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "duration:thisTurn",
        "activation:blocker",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });

  it("keeps all and up-to target selectors separate from the refresh-lock body primitive", () => {
    const choose = parsePreventOpponentCharactersRefreshInstruction({
      text: "up to 1 of your opponent's rested Characters will not become active in your opponent's next Refresh Phase.",
    });
    const all = parsePreventOpponentCharactersRefreshInstruction({
      text: "All of your opponent's rested Characters will not become active in your opponent's next Refresh Phase.",
    });

    expect(choose?.effect.type).toBe("cannotBecomeActive");
    expect(all?.effect.type).toBe("cannotBecomeActive");
    expect(choose?.evidence).toEqual(
      expect.arrayContaining([
        "cardinality:upTo",
        "instruction:preventActivation",
      ]),
    );
    expect(all?.evidence).toEqual(
      expect.arrayContaining([
        "cardinality:all",
        "instruction:preventActivation",
      ]),
    );
  });

  it("parses direct opponent Character rest protection as target plus protection plus duration", () => {
    expect(
      parsePreventOpponentCharactersRestInstruction({
        text: "Up to 1 of your opponent's Characters other than [Monkey.D.Luffy] cannot be rested until the end of your opponent's next End Phase.",
      }),
    ).toMatchObject({
      effect: {
        type: "giveProtection",
        target: {
          type: "choose",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zone: "characterArea",
            min: 0,
            max: 1,
            filter: {
              categories: ["character"],
              nameNot: ["Monkey.D.Luffy"],
            },
          },
        },
        protection: {
          process: "rest",
          sourceKind: "cardEffect",
          sourceControllerRelation: "opponentControlled",
        },
        duration: { type: "untilEndOfNextTurn", player: "opponent" },
      },
      evidence: [
        "instruction:giveProtection",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "filter:nameNot",
        "protectionProcess:rest",
        "duration:opponentNextEndPhase",
      ],
      rest: "",
    });
  });

  it("parses direct opponent Character rest protection during this turn", () => {
    expect(
      parsePreventOpponentCharactersRestInstruction({
        text: "Up to 1 of your opponent's Characters cannot be rested during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "giveProtection",
        target: {
          type: "choose",
          request: {
            player: "opponent",
            zone: "characterArea",
            min: 0,
            max: 1,
            filter: {
              categories: ["character"],
            },
          },
        },
        protection: {
          process: "rest",
          sourceKind: "cardEffect",
          sourceControllerRelation: "opponentControlled",
        },
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:giveProtection",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "protectionProcess:rest",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });

  it("parses your Leader power through opponent next End Phase as a modifier", () => {
    expect(
      parseYourLeaderPowerOpponentNextEndInstruction({
        text: "your Leader gains +2000 power until the end of your opponent's next End Phase.",
      }),
    ).toEqual({
      effect: {
        type: "modifyPower",
        target: { type: "myLeader" },
        value: 2000,
        duration: { type: "untilEndOfNextTurn", player: "opponent" },
      },
      evidence: [
        "instruction:modifyPower",
        "target:yourLeader",
        "modifier:positivePower",
        "duration:opponentNextEndPhase",
      ],
      rest: "",
    });
  });

  it("does not parse unrelated field-effect wording", () => {
    expect(
      parseRestOpponentCharactersInstruction({
        text: "Rest up to 1 of your Characters",
      }),
    ).toBeUndefined();
    expect(
      parsePreventThatCharacterRefreshInstruction({
        text: "that Character will not become active this turn.",
      }),
    ).toBeUndefined();
    expect(
      parsePreventOpponentCharactersRefreshInstruction({
        text: "your opponent's Characters will not become active in your opponent's next Refresh Phase.",
      }),
    ).toBeUndefined();
    expect(
      parseYourLeaderPowerOpponentNextEndInstruction({
        text: "your Leader gains power.",
      }),
    ).toBeUndefined();
  });
});
