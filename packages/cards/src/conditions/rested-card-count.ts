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
    "player:opponent",
    "filter:state:rested",
  ],
} as const;

export const parseRestedCardCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const subjectMatch =
    /^(?<player>you|your opponent) (?:have|has)\s+(?<comparison>.+)$/i.exec(
      input.text,
    );
  const playerText = subjectMatch?.groups?.["player"];
  const comparisonText = subjectMatch?.groups?.["comparison"];
  if (playerText === undefined || comparisonText === undefined) {
    return undefined;
  }
  const player = playerText.toLowerCase() === "you" ? "self" : "opponent";

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
      player,
      filter: { state: "rested" },
      op: comparison.op,
      value: comparison.value,
    },
    evidence: [
      "condition:fieldCount",
      ...comparison.evidence,
      player === "self" ? "player:self" : "player:opponent",
      "filter:state:rested",
    ],
    rest: "",
  };
};
