import type { InstructionParser } from "../../types.js";
import { revealedTopLifeSet } from "../reveal-top.js";

export const parseThisCharacterRevealedCostPower: InstructionParser = (
  input,
) => {
  const match =
    /^This Character gains \+(?<amount>\d+) power during this turn per 1 cost on the revealed card\.?$/iu.exec(
      input.text.trim(),
    );
  const rawAmount = match?.groups?.["amount"];
  if (rawAmount === undefined) {
    return undefined;
  }
  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: { type: "self" },
      value: {
        type: "sumSelectedCardCosts",
        selection: revealedTopLifeSet,
        multiplier: amount,
      },
      duration: { type: "thisTurn" },
    },
    evidence: [
      "instruction:modifyPower",
      "target:thisCharacter",
      "value:dynamic:selectedCardCost",
      "modifier:positivePower",
      "duration:thisTurn",
    ],
    rest: "",
  };
};
