import type { InstructionParser } from "../types.js";
import { parseReferencedEffectEntryPointText } from "../references/effect-entry-point.js";

export const activateReferencedEffectInstructionPrimitive = {
  primitiveId: "instruction:activateReferencedEffect",
  childPrimitiveIds: ["target:triggerCard", "reference:effectEntryPoint"],
} as const;

export const parseActivateReferencedEffectInstruction: InstructionParser = (
  input,
) => {
  const match = /^Activate this card's (?<reference>.+)$/i.exec(input.text);
  const referenceText = match?.groups?.["reference"];
  if (referenceText === undefined) {
    return undefined;
  }

  const reference = parseReferencedEffectEntryPointText(referenceText);
  if (reference === undefined || reference.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "activateReferencedEffect",
      source: { type: "triggerCard" },
      trigger: reference.trigger,
    },
    evidence: [
      "instruction:activateReferencedEffect",
      "target:triggerCard",
      ...reference.evidence,
    ],
    rest: "",
  };
};
