import type { InstructionParser } from "../types.js";

export const parseDamageInstruction: InstructionParser = (input) => {
  const match =
    /^(?:You may )?deal (?<count>[1-9]\d*) damage to your opponent\.?$/iu.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "damage",
      target: "leader",
      player: "opponent",
      count: Number.parseInt(countText, 10),
    },
    evidence: [
      "instruction:damage",
      "target:player",
      "player:opponent",
      "count:positiveInteger",
    ],
    rest: "",
  };
};
