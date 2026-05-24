import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { InstructionParseResult, InstructionParser } from "../types.js";

type InstructionPrimitiveDefinition =
  PrimitivePatternDefinition<InstructionParseResult>;

export const restOpponentCharactersPrimitive: InstructionPrimitiveDefinition = {
  primitiveId: "instruction:rest",
  matches: [
    {
      id: "rest-up-to-opponent-characters",
      pattern:
        /^Rest up to (?<count>[1-9]\d*) of your opponent's Characters?\.?$/i,
      build: () => ({
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
      }),
    },
  ],
};

export const preventThatCharacterRefreshPrimitive: InstructionPrimitiveDefinition =
  {
    primitiveId: "instruction:preventActivation",
    matches: [
      {
        id: "prevent-that-character-opponent-next-refresh",
        pattern:
          /^that Character will not become active in your opponent's next Refresh Phase\.?$/i,
        build: () => ({
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
        }),
      },
    ],
  };

export const yourLeaderPowerOpponentNextEndPrimitive: InstructionPrimitiveDefinition =
  {
    primitiveId: "instruction:modifyPower",
    matches: [
      {
        id: "your-leader-power-opponent-next-end",
        pattern:
          /^your Leader gains \+(?<value>[1-9]\d*) power until the end of your opponent's next End Phase\.?$/i,
        build: () => ({
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
        }),
      },
    ],
  };

export const parseRestOpponentCharactersInstruction: InstructionParser = (
  input,
) => parsePrimitivePattern(input, restOpponentCharactersPrimitive);

export const parsePreventThatCharacterRefreshInstruction: InstructionParser = (
  input,
) => parsePrimitivePattern(input, preventThatCharacterRefreshPrimitive);

export const parseYourLeaderPowerOpponentNextEndInstruction: InstructionParser =
  (input) =>
    parsePrimitivePattern(input, yourLeaderPowerOpponentNextEndPrimitive);
