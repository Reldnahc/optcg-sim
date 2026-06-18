import type { InstructionParser } from "../types.js";

export const parseForcedReturnDonInstruction: InstructionParser = (input) => {
  const untilSameDonCount = parseReturnUntilSameDonCount(input.text);
  if (untilSameDonCount !== undefined) {
    return untilSameDonCount;
  }

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

function parseReturnUntilSameDonCount(
  text: string,
): ReturnType<InstructionParser> {
  const match =
    /^return DON!! cards? from your field to your DON!! deck until you have the same number of DON!! cards on your field as your opponent\.?$/iu.exec(
      text,
    );
  if (match === null) {
    return undefined;
  }

  return {
    effect: {
      type: "returnDon",
      player: "self",
      count: {
        type: "fieldCountDifference",
        minuend: {
          player: "self",
          zone: "costArea",
          filter: { categories: ["don"] },
        },
        subtrahend: {
          player: "opponent",
          zone: "costArea",
          filter: { categories: ["don"] },
        },
        minimum: 0,
      },
    },
    evidence: [
      "instruction:returnDon",
      "player:self",
      "condition:fieldCountDifference",
      "filter:category:don",
      "valueTransform:minimum",
    ],
    rest: "",
  };
}
