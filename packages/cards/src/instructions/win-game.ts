import type { InstructionParser } from "../types.js";

export const parseWinGameInstruction: InstructionParser = (input) => {
  if (!/^you win the game\.?$/iu.test(input.text.trim())) {
    return undefined;
  }

  return {
    effect: { type: "winGame", player: "self" },
    evidence: ["instruction:winGame", "player:self"],
    rest: "",
  };
};
