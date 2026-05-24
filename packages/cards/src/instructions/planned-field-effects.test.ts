import { describe, expect, it } from "vitest";

import {
  parsePreventThatCharacterRefreshInstruction,
  parseRestOpponentCharactersInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
} from "./planned-field-effects.js";

describe("planned field-effect instruction parsers", () => {
  it("parses rest opponent Characters as a planned primitive", () => {
    expect(
      parseRestOpponentCharactersInstruction({
        text: "Rest up to 1 of your opponent's Characters",
      }),
    ).toEqual({
      effect: { type: "custom", handler: "planned:restOpponentCharacters" },
      evidence: [
        "instruction:rest",
        "instructionSupport:planned",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
      ],
      rest: "",
    });
  });

  it("parses the selected Character refresh lock as a planned primitive", () => {
    expect(
      parsePreventThatCharacterRefreshInstruction({
        text: "that Character will not become active in your opponent's next Refresh Phase.",
      }),
    ).toEqual({
      effect: {
        type: "custom",
        handler: "planned:preventThatCharacterOpponentNextRefresh",
      },
      evidence: [
        "instruction:preventActivation",
        "instructionSupport:planned",
        "reference:thatCharacter",
        "target:thatCharacter",
        "duration:opponentNextRefreshPhase",
      ],
      rest: "",
    });
  });

  it("parses your Leader power through opponent next End Phase as planned", () => {
    expect(
      parseYourLeaderPowerOpponentNextEndInstruction({
        text: "your Leader gains +2000 power until the end of your opponent's next End Phase.",
      }),
    ).toEqual({
      effect: {
        type: "custom",
        handler: "planned:yourLeaderPowerOpponentNextEnd",
      },
      evidence: [
        "instruction:modifyPower",
        "instructionSupport:planned",
        "modifier:positivePower",
        "target:yourLeader",
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
      parseYourLeaderPowerOpponentNextEndInstruction({
        text: "your Leader gains power.",
      }),
    ).toBeUndefined();
  });
});
