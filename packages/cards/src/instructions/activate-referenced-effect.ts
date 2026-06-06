import type { InstructionParser } from "../types.js";
import { supportedEntryPoints } from "../entry-point-definitions.js";

export const activateReferencedEffectInstructionPrimitive = {
  primitiveId: "instruction:activateReferencedEffect",
  childPrimitiveIds: ["target:triggerCard", "reference:effectEntryPoint"],
} as const;

export const parseActivateReferencedEffectInstruction: InstructionParser = (
  input,
) => {
  const match = /^Activate this card's (?<entry>\[[^\]]+\]) effect\.?$/i.exec(
    input.text,
  );
  const entryText = match?.groups?.["entry"];
  if (entryText === undefined) {
    return undefined;
  }

  const entryPoint = supportedEntryPoints.find(
    (candidate) => candidate.text.toLowerCase() === entryText.toLowerCase(),
  );
  if (entryPoint === undefined) {
    return undefined;
  }

  const referenceEvidence =
    entryPoint.trigger.type === "main"
      ? (["reference:eventMain"] as const)
      : ([] as const);

  return {
    effect: {
      type: "activateReferencedEffect",
      source: { type: "triggerCard" },
      trigger: entryPoint.trigger,
    },
    evidence: [
      "instruction:activateReferencedEffect",
      "target:triggerCard",
      ...referenceEvidence,
    ],
    rest: "",
  };
};
