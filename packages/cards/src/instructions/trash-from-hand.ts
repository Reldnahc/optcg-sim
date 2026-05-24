import type { InstructionParser } from "../types.js";

const trashFromHandPattern =
  /^trash (?<count>[1-9]\d*) cards? from your hand\.?$/i;

export const parseTrashFromHandInstruction: InstructionParser = (input) => {
  const match = trashFromHandPattern.exec(input.text);
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "trashFromHand",
      count: Number.parseInt(countText, 10),
      player: "self",
      chooser: "self",
    },
    evidence: [
      "instruction:trashFromHand",
      "count:positiveInteger",
      "player:self",
      "chooser:self",
    ],
    rest: "",
  };
};
