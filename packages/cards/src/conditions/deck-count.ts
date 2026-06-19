import type { ConditionParseResult, ConditionParser } from "../types.js";

export const parseDeckCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const equality = /^your deck has (?<count>\d+) cards$/iu.exec(input.text);
  const threshold =
    /^you have (?<count>\d+) or (?<direction>less|more) cards in your deck$/iu.exec(
      input.text,
    );
  const countText = equality?.groups?.["count"] ?? threshold?.groups?.["count"];
  const directionText = threshold?.groups?.["direction"];
  if (countText === undefined) {
    return undefined;
  }
  const count = Number.parseInt(countText, 10);
  if (!Number.isSafeInteger(count) || count < 0) {
    return undefined;
  }
  const op =
    directionText === "less" ? "lte" : directionText === "more" ? "gte" : "eq";

  return {
    condition: {
      type: "deckCount",
      player: "self",
      op,
      value: count,
    },
    evidence: [
      "condition:deckCount",
      `condition:comparator:${op}`,
      "condition:threshold:nonNegativeInteger",
      "player:self",
      "zone:deck",
    ],
    rest: "",
  };
};
