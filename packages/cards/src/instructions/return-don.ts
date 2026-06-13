import type { InstructionParser } from "../types.js";

export const parseForcedReturnDonInstruction: InstructionParser = (input) => {
  const selfMatch =
    /^return (?<count>[1-9]\d*) DON!! cards? from your field to your DON!! deck\.?$/i.exec(
      input.text,
    );
  const opponentMatch =
    /^your opponent returns (?<count>[1-9]\d*) DON!! cards? from their field to their DON!! deck\.?$/i.exec(
      input.text,
    );
  const match = selfMatch ?? opponentMatch;
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }
  const player = selfMatch === null ? "opponent" : "self";

  return {
    effect: {
      type: "returnDon",
      count: Number.parseInt(countText, 10),
      player,
    },
    evidence: [
      "instruction:returnDon",
      player === "self" ? "player:self" : "player:opponent",
      "count:positiveInteger",
    ],
    rest: "",
  };
};
