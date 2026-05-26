import type { InstructionParser } from "../types.js";

export const activateReferencedEffectInstructionPrimitive = {
  primitiveId: "instruction:activateReferencedEffect",
  childPrimitiveIds: ["target:triggerCard", "reference:eventMain"],
} as const;

export const parseActivateReferencedEffectInstruction: InstructionParser = (
  input,
) => {
  if (!/^Activate this card's \[Main\] effect\.?$/i.test(input.text)) {
    return undefined;
  }

  return {
    effect: {
      type: "activateReferencedEffect",
      source: { type: "triggerCard" },
      trigger: { type: "main" },
    },
    evidence: [
      "instruction:activateReferencedEffect",
      "target:triggerCard",
      "reference:eventMain",
    ],
    rest: "",
  };
};
