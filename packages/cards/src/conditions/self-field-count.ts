import { parseCardFilterPredicates } from "../filters/index.js";
import type { ConditionParseResult, ConditionParser } from "../types.js";
import { parseLeadingCountComparison } from "./comparison.js";

export const parseSelfFieldCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const subjectMatch = /^you have\s+(?<comparison>.+)$/i.exec(input.text);
  const comparisonText = subjectMatch?.groups?.["comparison"];
  if (comparisonText === undefined) {
    return undefined;
  }

  const singularCharacterMatch =
    /^an?\s+(?<predicate>Character(?: card)?s?\b.*)$/i.exec(comparisonText);
  const singularPredicateText = singularCharacterMatch?.groups?.["predicate"];
  if (singularPredicateText !== undefined) {
    const predicates = parseCardFilterPredicates(
      { text: singularPredicateText },
      { powerSemantics: "current" },
    );
    if (predicates === undefined || predicates.rest.trim().length > 0) {
      return undefined;
    }

    return {
      condition: {
        type: "fieldCount",
        player: "self",
        filter: predicates.filter,
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:fieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
        ...predicates.evidence,
      ],
      rest: "",
    };
  }

  const comparison = parseLeadingCountComparison({ text: comparisonText });
  if (comparison === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({
    text: comparison.rest,
  });
  if (predicates === undefined || predicates.rest.trim().length > 0) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCount",
      player: "self",
      filter: predicates.filter,
      op: comparison.op,
      value: comparison.value,
    },
    evidence: [
      "condition:fieldCount",
      ...comparison.evidence,
      "player:self",
      ...predicates.evidence,
    ],
    rest: "",
  };
};
