import { parseUpToCardinality } from "../../cardinality/index.js";
import {
  parseTargetFromSet,
  selectedPowerGainTargetParsers,
} from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import { parseFieldEffectDuration } from "./shared.js";

export const parseAllowAttackActiveCharactersInstruction: InstructionParser = (
  input,
) => {
  const cardinality = parseUpToCardinality(input);
  if (cardinality === undefined) {
    return undefined;
  }

  const target = parseTargetFromSet(
    { text: cardinality.rest },
    selectedPowerGainTargetParsers(),
  );
  if (target?.target === undefined) {
    return undefined;
  }

  const permissionText =
    /^can also attack active Characters\s*(?<rest>.*)$/iu.exec(target.rest)
      ?.groups?.["rest"] ?? undefined;
  if (permissionText === undefined) {
    return undefined;
  }

  const duration = parseFieldEffectDuration({ text: permissionText });
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "allowAttackActiveCharacters",
      target: target.target,
      duration: duration.duration,
    },
    evidence: [
      "instruction:allowAttackActiveCharacters",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};
