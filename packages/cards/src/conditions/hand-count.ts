import type { ConditionParseResult, ConditionParser } from "../types.js";

export const parseHandCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const match =
    /^your opponent has (?<count>[1-9]\d*) or more cards in their hand$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    condition: {
      type: "handCount",
      player: "opponent",
      op: "gte",
      value: Number.parseInt(countText, 10),
    },
    evidence: [
      "condition:handCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:opponent",
    ],
    rest: "",
  };
};
