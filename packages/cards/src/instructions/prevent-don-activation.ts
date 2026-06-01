import type { Effect } from "@optcg/types";

import type { InstructionParser } from "../types.js";

export const preventDonActivationInstructionPrimitive = {
  primitiveId: "instruction:preventDonActivation",
  childPrimitiveIds: [
    "player:self",
    "target:yourDonCards",
    "filter:category:don",
    "sourceCategory:character",
    "duration:thisTurn",
  ],
  parseEvidence: [
    "instruction:preventDonActivation",
    "player:self",
    "target:yourDonCards",
    "filter:category:don",
    "sourceCategory:character",
    "duration:thisTurn",
  ],
} as const;

export const parsePreventDonActivationInstruction: InstructionParser = (
  input,
) => {
  const match =
    /^you cannot set DON!! cards as active using Character effects during this turn\.?$/i.exec(
      input.text.trim(),
    );
  if (match === null) {
    return undefined;
  }

  const effect = {
    type: "preventDonActivation",
    player: "self",
    sourceCategories: ["character"],
    duration: { type: "thisTurn" },
  } satisfies Effect;

  return {
    effect,
    evidence: preventDonActivationInstructionPrimitive.parseEvidence,
    rest: "",
  };
};
