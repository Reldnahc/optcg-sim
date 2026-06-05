import { describe, expect, it } from "vitest";

import {
  preventOpponentCharactersRefreshPrimitive,
  preventThatCharacterRefreshPrimitive,
  parsePreventOpponentCharactersRefreshInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseRestOpponentCharactersOrDonCardsInstruction,
  parseRestOpponentCharactersInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
  restOpponentCharactersOrDonCardsPrimitive,
  restOpponentCharactersPrimitive,
  yourLeaderPowerOpponentNextEndPrimitive,
} from "./planned-field-effects.js";

describe("planned field-effect instruction parsers", () => {
  it("defines field-effect instructions as primitive parents with match families", () => {
    expect(restOpponentCharactersPrimitive).toEqual({
      primitiveId: "instruction:rest",
      childPrimitiveIds: ["cardinality:upTo", "target:opponentCharacters"],
    });
    expect(restOpponentCharactersOrDonCardsPrimitive).toEqual({
      primitiveId: "instruction:rest",
      childPrimitiveIds: [
        "cardinality:upTo",
        "target:opponentCharactersOrDonCards",
      ],
    });
    expect(preventThatCharacterRefreshPrimitive).toEqual({
      primitiveId: "instruction:preventActivation",
      childPrimitiveIds: [
        "reference:thatCharacter",
        "duration:opponentNextRefreshPhase",
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
