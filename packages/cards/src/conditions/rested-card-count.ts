import type { ConditionParseResult, ConditionParser } from "../types.js";
import { parseLeadingCountComparison } from "./comparison.js";

export const restedCardCountConditionPrimitive = {
  primitiveId: "condition:fieldCount",
  childPrimitiveIds: [
    "player:self",
    "condition:comparator:gte",
    "condition:comparator:lte",
    "condition:comparator:eq",
    "condition:threshold:positiveInteger",
    "filter:state:rested",
  ],
} as const;

export const parseRestedCardCountCondition: ConditionParser = (
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

  if (!/^rested cards?$/i.test(comparison.rest)) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCount",
      player: "self",
      filter: { state: "rested" },
      op: comparison.op,
      value: comparison.value,
    },
    evidence: [
      "condition:fieldCount",
      ...comparison.evidence,
      "player:self",
      "filter:state:rested",
    ],
    rest: "",
  };
};
