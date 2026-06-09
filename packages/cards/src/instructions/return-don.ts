import type { InstructionParser } from "../types.js";

export const parseForcedReturnDonInstruction: InstructionParser = (input) => {
  const match =
    /^your opponent returns (?<count>[1-9]\d*) DON!! cards? from their field to their DON!! deck\.?$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "returnDon",
      count: Number.parseInt(countText, 10),
      player: "opponent",
    },
    evidence: [
      "instruction:returnDon",
      "player:opponent",
      "count:positiveInteger",
    ],
    rest: "",
  };
};
