import type { InstructionParser } from "../types.js";

export const parseRestOpponentCharactersInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^Rest up to (?<count>[1-9]\d*) of your opponent's Characters\.?$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
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
  };
};

export const parsePreventThatCharacterRefreshInstruction: InstructionParser = (
  input,
) => {
  if (
    !/^that Character will not become active in your opponent's next Refresh Phase\.?$/i.test(
      input.text,
    )
  ) {
    return undefined;
  }

  return {
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
  };
};

export const parseYourLeaderPowerOpponentNextEndInstruction: InstructionParser =
  (input) => {
    const match =
      /^your Leader gains \+(?<value>[1-9]\d*) power until the end of your opponent's next End Phase\.?$/i.exec(
        input.text,
      );
    const valueText = match?.groups?.["value"];
    if (valueText === undefined) {
      return undefined;
    }

    return {
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
    };
  };
