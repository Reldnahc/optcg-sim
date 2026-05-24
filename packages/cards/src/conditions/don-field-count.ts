import type { ConditionParseResult, ConditionParser } from "../types.js";
import { parseLeadingCountComparison } from "./comparison.js";

export const donFieldCountConditionPrimitive = {
  primitiveId: "condition:donFieldCount",
  childPrimitiveIds: [
    "player:self",
    "condition:comparator:lte",
    "condition:threshold:positiveInteger",
    "filter:category:don",
  ],
} as const;

export const parseDonFieldCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const subjectMatch = /^you have\s+(?<comparison>.+)$/i.exec(input.text);
  const comparisonText = subjectMatch?.groups?.["comparison"];
  if (comparisonText === undefined) {
    return undefined;
  }

  const comparison = parseLeadingCountComparison({ text: comparisonText });
  if (comparison === undefined) {
    return undefined;
  }

  const objectMatch = /^DON!! cards on your field$/i.exec(comparison.rest);
  if (objectMatch === null) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCount",
      player: "self",
      filter: { categories: ["don"] },
      op: comparison.op,
      value: comparison.value,
    },
    evidence: [
      "condition:donFieldCount",
      ...comparison.evidence,
      "player:self",
      "filter:category:don",
    ],
    rest: "",
  };
};
