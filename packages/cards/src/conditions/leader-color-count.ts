import type { ConditionParseResult, ConditionParser } from "../types.js";

export const parseLeaderColorCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  if (!/^your Leader is multicolored$/i.test(input.text)) {
    return undefined;
  }

  return {
    condition: {
      type: "leaderColorCount",
      player: "self",
      op: "gte",
      value: 2,
    },
    evidence: [
      "condition:leaderColorCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:self",
    ],
    rest: "",
  };
};
