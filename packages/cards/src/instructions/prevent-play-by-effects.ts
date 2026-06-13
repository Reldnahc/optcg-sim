import type { Effect } from "@optcg/types";

import type { InstructionParser } from "../types.js";

export const parsePreventPlayByEffectsInstruction: InstructionParser = (
  input,
) => {
  if (
    !/^This card in your hand cannot be played by effects\.?$/iu.test(
      input.text.trim(),
    )
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "preventPlayByEffects",
      target: { type: "self" },
      duration: { type: "permanent" },
    } satisfies Effect,
    evidence: [
      "instruction:preventPlayByEffects",
      "target:thisCard",
      "zone:hand",
      "duration:permanent",
    ],
    rest: "",
  };
};
