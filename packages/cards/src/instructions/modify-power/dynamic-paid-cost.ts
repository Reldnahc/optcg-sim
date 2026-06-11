import type { Duration, Target } from "@optcg/types";

import type { InstructionParser, PrimitiveEvidence } from "../../types.js";

const paidCostTrashFromHandReference = "paidCost:trashFromHand";

export const parsePaidCostCardCountPower: InstructionParser = (input) => {
  const match =
    /^(?<target>This Leader|This Character) gains? \+(?<amount>[1-9]\d*) power (?<duration>during this battle|during this turn) for every card trashed\.?$/iu.exec(
      input.text.trim(),
    );
  const targetText = match?.groups?.["target"];
  const amountText = match?.groups?.["amount"];
  const durationText = match?.groups?.["duration"];
  if (
    targetText === undefined ||
    amountText === undefined ||
    durationText === undefined
  ) {
    return undefined;
  }

  const amount = Number.parseInt(amountText, 10);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return undefined;
  }

  const duration = parseDuration(durationText);
  const target = parseSelfTarget(targetText);

  return {
    effect: {
      type: "modifyPower",
      target: target.target,
      value: {
        type: "paidCostCardCount",
        cost: paidCostTrashFromHandReference,
        multiplier: amount,
      },
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      target.evidence,
      "value:dynamic:paidCostCardCount",
      "modifier:positivePower",
      duration.evidence,
    ],
    rest: "",
  };
};

const parseSelfTarget = (
  text: string,
): { readonly target: Target; readonly evidence: PrimitiveEvidence } => ({
  target: { type: "self" },
  evidence:
    text.toLowerCase() === "this character"
      ? "target:thisCharacter"
      : "target:thisCard",
});

const parseDuration = (
  text: string,
): { readonly duration: Duration; readonly evidence: PrimitiveEvidence } =>
  text.toLowerCase() === "during this battle"
    ? { duration: { type: "thisBattle" }, evidence: "duration:thisBattle" }
    : { duration: { type: "thisTurn" }, evidence: "duration:thisTurn" };
