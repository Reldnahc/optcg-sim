import type { InstructionParser } from "../types.js";

export const parsePlaySourceInstruction: InstructionParser = (input) => {
  if (
    !/^Play this card\.?$/i.test(input.text) &&
    !/^Play this Character card from your trash\.?$/i.test(input.text)
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "playSource",
      source: { type: "triggerCard" },
      ignoreCost: true,
    },
    evidence: ["instruction:playSource", "target:triggerCard"],
    rest: "",
  };
};
