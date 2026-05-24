import type { InstructionParser } from "../types.js";

const drawPattern = /^Draw (?<count>[1-9]\d*) cards?\.?$/i;

export const parseDrawInstruction: InstructionParser = (input) => {
  const match = drawPattern.exec(input.text);
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "draw",
      count: Number.parseInt(countText, 10),
      player: "self",
    },
    evidence: ["instruction:draw", "count:positiveInteger", "player:self"],
    rest: "",
  };
};
