import type { Target } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseThisTurnDuration } from "../durations/index.js";
import { parseNegativePowerModifier } from "../modifiers/index.js";
import { parseOpponentCharactersTarget } from "../targets/index.js";
import type { InstructionParser } from "../types.js";

export const modifyPowerInstructionPrimitive = {
  primitiveId: "instruction:modifyPower",
  childPrimitiveIds: [
    "cardinality:upTo",
    "target:opponentCharacters",
    "modifier:negativePower",
    "duration:thisTurn",
  ],
} as const;

export const parseModifyPowerInstruction: InstructionParser = (input) => {
  const actionMatch = /^give\s+(?<rest>.*)$/i.exec(input.text);
  const actionRest = actionMatch?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: actionRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseOpponentCharactersTarget({ text: cardinality.rest });
  if (target === undefined) {
    return undefined;
  }

  const modifier = parseNegativePowerModifier({ text: target.rest });
  if (modifier === undefined) {
    return undefined;
  }

  const duration = parseThisTurnDuration({ text: modifier.rest });
  if (duration === undefined || duration.duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: chooseOpponentCharactersTarget(cardinality.cardinality.max),
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...modifier.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};

function chooseOpponentCharactersTarget(max: number): Target {
  return {
    type: "choose",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "opponent",
      zone: "characterArea",
      min: 0,
      max,
      allowFewerIfUnavailable: true,
      visibility: "public",
      filter: { categories: ["character"] },
    },
  };
}
