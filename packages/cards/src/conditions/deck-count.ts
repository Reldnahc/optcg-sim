import type { ConditionParseResult, ConditionParser } from "../types.js";

export const parseDeckCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const match = /^your deck has (?<count>\d+) cards$/iu.exec(input.text);
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }
  const count = Number.parseInt(countText, 10);
  if (!Number.isSafeInteger(count) || count < 0) {
    return undefined;
  }

  return {
    condition: {
      type: "deckCount",
      player: "self",
      op: "eq",
      value: count,
    },
    evidence: [
      "condition:deckCount",
      "condition:comparator:eq",
      "condition:threshold:nonNegativeInteger",
      "player:self",
      "zone:deck",
    ],
    rest: "",
  };
};
