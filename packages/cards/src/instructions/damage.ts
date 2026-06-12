import type { InstructionParser } from "../types.js";

export const parseDamageInstruction: InstructionParser = (input) => {
  const opponentDamage =
    /^(?:You may )?deal (?<count>[1-9]\d*) damage to your opponent\.?$/iu.exec(
      input.text,
    );
  const selfDamage = /^(?:you )?take (?<count>[1-9]\d*) damage\.?$/iu.exec(
    input.text,
  );
  const countText =
    opponentDamage?.groups?.["count"] ?? selfDamage?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }
  const player = selfDamage === null ? "opponent" : "self";

  return {
    effect: {
      type: "damage",
      target: "leader",
      player,
      count: Number.parseInt(countText, 10),
    },
    evidence: [
      "instruction:damage",
      "target:player",
      player === "self" ? "player:self" : "player:opponent",
      "count:positiveInteger",
    ],
    rest: "",
  };
};
