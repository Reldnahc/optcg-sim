import type { ConditionParseResult, ConditionParser } from "../types.js";

export const parseTurnCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const match = /^it is your (?<value>[1-9]\d*|second) turn or later$/i.exec(
    input.text.trim(),
  );
  const valueText = match?.groups?.["value"];
  if (valueText === undefined) {
    return undefined;
  }
  const value =
    valueText.toLowerCase() === "second" ? 2 : Number.parseInt(valueText, 10);

  return {
    condition: {
      type: "turnCount",
      player: "self",
      op: "gte",
      value,
    },
    evidence: [
      "condition:turnCount",
      "player:self",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
    ],
    rest: "",
  };
};
