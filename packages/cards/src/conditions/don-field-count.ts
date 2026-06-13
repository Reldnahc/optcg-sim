import type { ConditionParseResult, ConditionParser } from "../types.js";
import { parseLeadingCountComparison } from "./comparison.js";

export const donFieldCountConditionPrimitive = {
  primitiveId: "condition:donFieldCount",
  childPrimitiveIds: [
    "player:self",
    "condition:comparator:lte",
    "condition:comparator:gte",
    "condition:comparator:eq",
    "condition:threshold:positiveInteger",
    "filter:category:don",
    "filter:state:attached",
    "filter:state:active",
    "player:opponent",
  ],
} as const;

const isDonCardsOnPlayersField = (
  text: string,
  player: "self" | "opponent",
): boolean => {
  const fieldOwner = player === "opponent" ? "their" : "your";

  return new RegExp(`^DON!! cards on ${fieldOwner} field$`, "i").test(text);
};

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

  const relativeEqualOrLessMatch =
    /^the number of DON!! cards on your field is equal to or less than the number on your opponent's field$/i.exec(
      input.text,
    );
  if (relativeEqualOrLessMatch !== null) {
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
        value: 0,
      },
      evidence: [
        "condition:fieldCountDifference",
        "player:opponent",
        "player:self",
        "filter:category:don",
        "condition:comparator:gte",
        "condition:threshold:nonNegativeInteger",
        "valueOffset:fieldCountDifference",
      ],
      rest: "",
    };
  }

  const subjectMatch =
    /^(?<player>you|your opponent) (?:have|has)\s+(?<comparison>.+)$/i.exec(
      input.text,
    );
  const comparisonText = subjectMatch?.groups?.["comparison"];
  if (comparisonText === undefined) {
    return undefined;
  }
  const player =
    subjectMatch?.groups?.["player"]?.toLowerCase() === "your opponent"
      ? "opponent"
      : "self";

  if (/^any DON!! cards given$/i.test(comparisonText)) {
    return {
      condition: {
        type: "fieldCount",
        player,
        filter: { categories: ["don"], state: "attached" },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        player === "self" ? "player:self" : "player:opponent",
        "filter:category:don",
        "filter:state:attached",
      ],
      rest: "",
    };
  }

  if (/^any DON!! cards on your field$/i.test(comparisonText)) {
    return {
      condition: {
        type: "fieldCount",
        player,
        filter: { categories: ["don"] },
        op: "gte",
        value: 1,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        player === "self" ? "player:self" : "player:opponent",
        "filter:category:don",
      ],
      rest: "",
    };
  }

  const normalizedComparisonText = comparisonText
    .replace(/^a total of\s+/iu, "")
    .trim();
  const comparison = parseLeadingCountComparison({
    text: normalizedComparisonText,
  });
  if (comparison === undefined) {
    return undefined;
  }

  if (/^given DON!! cards$/i.test(comparison.rest)) {
    return {
      condition: {
        type: "fieldCount",
        player,
        filter: { categories: ["don"], state: "attached" },
        op: comparison.op,
        value: comparison.value,
      },
      evidence: [
        "condition:donFieldCount",
        ...comparison.evidence,
        player === "self" ? "player:self" : "player:opponent",
        "filter:category:don",
        "filter:state:attached",
      ],
      rest: "",
    };
  }

  if (/^active DON!! cards$/i.test(comparison.rest)) {
    return {
      condition: {
        type: "fieldCount",
        player,
        filter: { categories: ["don"], state: "active" },
        op: comparison.op,
        value: comparison.value,
      },
      evidence: [
        "condition:donFieldCount",
        ...comparison.evidence,
        player === "self" ? "player:self" : "player:opponent",
        "filter:category:don",
        "filter:state:active",
      ],
      rest: "",
    };
  }

  if (!isDonCardsOnPlayersField(comparison.rest, player)) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCount",
      player,
      filter: { categories: ["don"] },
      op: comparison.op,
      value: comparison.value,
    },
    evidence: [
      "condition:donFieldCount",
      ...comparison.evidence,
      player === "self" ? "player:self" : "player:opponent",
      "filter:category:don",
    ],
    rest: "",
  };
};
