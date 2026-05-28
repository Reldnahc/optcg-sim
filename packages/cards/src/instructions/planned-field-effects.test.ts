import { describe, expect, it } from "vitest";

import {
  preventOpponentCharactersRefreshPrimitive,
  preventThatCharacterRefreshPrimitive,
  parsePreventOpponentCharactersRefreshInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseRestOpponentCharactersInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
  restOpponentCharactersPrimitive,
  yourLeaderPowerOpponentNextEndPrimitive,
} from "./planned-field-effects.js";

describe("planned field-effect instruction parsers", () => {
  it("defines field-effect instructions as primitive parents with match families", () => {
    expect(restOpponentCharactersPrimitive).toEqual({
      primitiveId: "instruction:rest",
      childPrimitiveIds: ["cardinality:upTo", "target:opponentCharacters"],
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
        "cardinality:upTo",
        "target:opponentCharacters",
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
              power: { max: 6000 },
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
        "filter:power",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "duration:opponentNextRefreshPhase",
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
