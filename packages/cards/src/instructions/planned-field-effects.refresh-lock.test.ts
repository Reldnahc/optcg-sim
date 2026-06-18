import { describe, expect, it } from "vitest";

import {
  parsePreventOpponentCharactersRefreshInstruction,
  parsePreventThatCharacterRefreshInstruction,
} from "./planned-field-effects.js";

describe("planned refresh-lock field-effect instruction parser", () => {
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

  it("parses opponent rested Character or DON refresh locks as a mixed public-zone selection", () => {
    expect(
      parsePreventOpponentCharactersRefreshInstruction({
        text: "Up to 1 of your opponent's rested Character or DON!! cards will not become active in your opponent's next Refresh Phase.",
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
            zones: ["characterArea", "costArea"],
            filter: {
              categories: ["character", "don"],
              state: "rested",
            },
            min: 0,
            max: 1,
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
        "zone:characterArea",
        "zone:costArea",
        "filter:category:character",
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
});
