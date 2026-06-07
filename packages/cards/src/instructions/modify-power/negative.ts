import { parseUpToCardinality } from "../../cardinality/index.js";
import { parseThisTurnDuration } from "../../durations/index.js";
import { parseNegativePowerModifier } from "../../modifiers/index.js";
import {
  parseAllFieldTarget,
  parseOpponentCharactersTarget,
} from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import { chooseOpponentCharactersTarget } from "./shared.js";

export const parseNegativePowerInstruction: InstructionParser = (input) => {
  const actionRest = /^give\s+(?<rest>.*)$/i.exec(input.text)?.groups?.["rest"];
  if (actionRest === undefined) {
    return undefined;
  }

  const allTarget = parseAllFieldTarget({ text: actionRest });
  if (allTarget !== undefined) {
    const modifier = parseNegativePowerModifier({ text: allTarget.rest });
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
        target: allTarget.target,
        value: modifier.value,
        duration: duration.duration,
      },
      evidence: [
        "instruction:modifyPower",
        ...allTarget.evidence,
        ...modifier.evidence,
        ...duration.evidence,
      ],
      rest: "",
    };
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
      target: chooseOpponentCharactersTarget(
        cardinality.cardinality.max,
        target.filter ?? { categories: ["character"] },
      ),
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
