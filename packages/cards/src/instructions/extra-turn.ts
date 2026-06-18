import type { InstructionParser } from "../types.js";

export const parseTakeExtraTurnInstruction: InstructionParser = (input) => {
  if (!/^take an extra turn after this one\.?$/iu.test(input.text.trim())) {
    return undefined;
  }

  return {
    effect: { type: "takeExtraTurn", player: "self" },
    evidence: ["instruction:takeExtraTurn", "player:self"],
    rest: "",
  };
};
