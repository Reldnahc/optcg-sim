import type { ConditionParseResult, ConditionParser } from "../types.js";

export const parseSelfStatComparisonCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const match =
    /^this Character has (?<value>[1-9]\d*) power (?<direction>or more|or less)$/iu.exec(
      input.text,
    );
  const valueText = match?.groups?.["value"];
  const direction = match?.groups?.["direction"];
  if (valueText === undefined || direction === undefined) {
    return undefined;
  }

  const op = direction.toLowerCase() === "or more" ? "gte" : "lte";

  return {
    condition: {
      type: "cardStatComparison",
      target: { type: "self" },
      stat: "currentPower",
      op,
      value: Number.parseInt(valueText, 10),
    },
    evidence: [
      "condition:cardStatComparison",
      "condition:stat:currentPower",
      op === "gte" ? "condition:comparator:gte" : "condition:comparator:lte",
      "condition:threshold:positiveInteger",
      "target:thisCharacter",
    ],
    rest: "",
  };
};
