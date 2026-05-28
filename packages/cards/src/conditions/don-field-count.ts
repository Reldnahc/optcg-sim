import type { ConditionParseResult, ConditionParser } from "../types.js";
import { parseLeadingCountComparison } from "./comparison.js";

export const donFieldCountConditionPrimitive = {
  primitiveId: "condition:donFieldCount",
  childPrimitiveIds: [
    "player:self",
    "condition:comparator:lte",
    "condition:comparator:gte",
    "condition:threshold:positiveInteger",
    "filter:category:don",
    "filter:state:attached",
  ],
} as const;

export const parseDonFieldCountCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const relativeMatch =
    /^the number of DON!! cards on your field is at least (?<value>[1-9]\d*) less than the number on your opponent's field$/i.exec(
      input.text,
    );
  const relativeValueText = relativeMatch?.groups?.["value"];
  if (relativeValueText !== undefined) {
    return {
      condition: {
        type: "fieldCountDifference",
        minuend: {
          player: "opponent",
          filter: { categories: ["don"] },
        },
        subtrahend: {
          player: "self",
          filter: { categories: ["don"] },
        },
        op: "gte",
        value: Number.parseInt(relativeValueText, 10),
      },
      evidence: [
        "condition:fieldCountDifference",
        "player:opponent",
        "player:self",
        "filter:category:don",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "valueOffset:fieldCountDifference",
      ],
      rest: "",
    };
  }

  const subjectMatch = /^you have\s+(?<comparison>.+)$/i.exec(input.text);
  const comparisonText = subjectMatch?.groups?.["comparison"];
  if (comparisonText === undefined) {
    return undefined;
  }

  if (/^any DON!! cards given$/i.test(comparisonText)) {
    return {
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["don"], state: "attached" },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:category:don",
        "filter:state:attached",
      ],
      rest: "",
    };
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
