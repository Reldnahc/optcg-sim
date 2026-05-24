import { parseUpToCardinality } from "../cardinality/index.js";
import {
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
} from "../durations/index.js";
import { parsePositivePowerModifier } from "../modifiers/index.js";
import { parseThatCharacterReference } from "../references/index.js";
import {
  parseOpponentCharactersTarget,
  parseYourLeaderTarget,
} from "../targets/index.js";
import type { InstructionParser } from "../types.js";

export const restOpponentCharactersPrimitive = {
  primitiveId: "instruction:rest",
  childPrimitiveIds: ["cardinality:upTo", "target:opponentCharacters"],
} as const;

export const preventThatCharacterRefreshPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "reference:thatCharacter",
    "duration:opponentNextRefreshPhase",
  ],
} as const;

export const yourLeaderPowerOpponentNextEndPrimitive = {
  primitiveId: "instruction:modifyPower",
  childPrimitiveIds: [
    "target:yourLeader",
    "modifier:positivePower",
    "duration:opponentNextEndPhase",
  ],
} as const;

export const parseRestOpponentCharactersInstruction: InstructionParser = (
  input,
) => {
  const actionMatch = /^Rest\s+(?<rest>.*)$/i.exec(input.text);
  const actionRest = actionMatch?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOpponentCharactersTarget({ text: cardinality.rest });
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }

  return {
    effect: { type: "custom", handler: "planned:restOpponentCharacters" },
    evidence: [
      "instruction:rest",
      "instructionSupport:planned",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
    ],
    rest: "",
  };
};

export const parsePreventThatCharacterRefreshInstruction: InstructionParser = (
  input,
) => {
  const reference = parseThatCharacterReference(input);
  if (reference === undefined) {
    return undefined;
  }

  const actionMatch = /^will not become active\s+(?<rest>.*)$/i.exec(
    reference.rest,
  );
  const durationText = actionMatch?.groups?.["rest"];
  if (durationText === undefined) {
    return undefined;
  }

  const duration = parseOpponentNextRefreshPhaseDuration({
    text: durationText,
  });
  if (duration === undefined || duration.rest.length > 0) {
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
      ...reference.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};

export const parseYourLeaderPowerOpponentNextEndInstruction: InstructionParser =
  (input) => {
    const target = parseYourLeaderTarget(input);
    if (target === undefined) {
      return undefined;
    }

    const actionMatch = /^gains\s+(?<rest>.*)$/i.exec(target.rest);
    const modifierText = actionMatch?.groups?.["rest"];
    if (modifierText === undefined) {
      return undefined;
    }

    const modifier = parsePositivePowerModifier({ text: modifierText });
    if (modifier === undefined) {
      return undefined;
    }

    const duration = parseOpponentNextEndPhaseDuration({
      text: modifier.rest,
    });
    if (duration === undefined || duration.rest.length > 0) {
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
        ...target.evidence,
        ...modifier.evidence,
        ...duration.evidence,
      ],
      rest: "",
    };
  };
