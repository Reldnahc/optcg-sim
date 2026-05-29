import { parseCardFilterPredicates } from "../filters/index.js";
import type { ConditionParseResult, ConditionParser } from "../types.js";
import { parseLeadingCountComparison } from "./comparison.js";

export const opponentRestedCharactersConditionPrimitive = {
  primitiveId: "condition:opponentFieldCount",
  childPrimitiveIds: [
    "player:opponent",
    "condition:comparator:gte",
    "condition:threshold:positiveInteger",
    "filter:state:rested",
    "filter:category:character",
  ],
} as const;

export const parseOpponentRestedCharactersCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const subjectMatch = /^your opponent has\s+(?<comparison>.+)$/i.exec(
    input.text,
  );
  const comparisonText = subjectMatch?.groups?.["comparison"];
  if (comparisonText === undefined) {
    return undefined;
  }

  const comparison = parseLeadingCountComparison({ text: comparisonText });
  if (comparison === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: comparison.rest },
    { powerSemantics: "current" },
  );
  if (
    predicates === undefined ||
    predicates.rest.length > 0 ||
    predicates.filter.categories?.[0] !== "character" ||
    predicates.filter.state !== "rested"
  ) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCount",
      player: "opponent",
      filter: predicates.filter,
      op: comparison.op,
      value: comparison.value,
    },
    evidence: [
      "condition:opponentFieldCount",
      ...comparison.evidence,
      "player:opponent",
      ...predicates.evidence,
    ],
    rest: "",
  };
};
