import { parseCardFilterPredicates } from "../filters/index.js";
import type { ConditionParseResult, ConditionParser } from "../types.js";

export const parseLeaderNameCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const subjectMatch = /^your Leader (?:is|has the)\s+(?<predicate>.+)$/i.exec(
    input.text,
  );
  const predicateText = subjectMatch?.groups?.["predicate"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: predicateText });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  return {
    condition: {
      type: "hasCardInZone",
      zone: "leaderArea",
      player: "self",
      filter: {
        categories: ["leader"],
        ...predicates.filter,
      },
    },
    evidence: [
      "condition:leaderIdentity",
      "player:self",
      "zone:leaderArea",
      "filter:category:leader",
      ...predicates.evidence,
    ],
    rest: "",
  };
};
