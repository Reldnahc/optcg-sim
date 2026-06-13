import type { CardFilter } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type {
  ConditionParseResult,
  ConditionParser,
  PrimitiveEvidence,
} from "../types.js";
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
    "filter:type",
    "filter:category:character",
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

  const filter = parseRestedFieldCountFilter(comparison.rest);
  if (filter === undefined) {
    return undefined;
  }

  return {
    condition: {
      type: "fieldCount",
      player,
      filter: filter.filter,
      op: comparison.op,
      value: comparison.value,
    },
    evidence: [
      "condition:fieldCount",
      ...comparison.evidence,
      player === "self" ? "player:self" : "player:opponent",
      ...filter.evidence,
    ],
    rest: "",
  };
};

function parseRestedFieldCountFilter(text: string):
  | {
      readonly evidence: readonly PrimitiveEvidence[];
      readonly filter: CardFilter;
    }
  | undefined {
  if (/^rested cards?$/i.test(text)) {
    return { filter: { state: "rested" }, evidence: ["filter:state:rested"] };
  }

  const rested = /^rested\s+(?<rest>.+)$/iu.exec(text.trim());
  const filterText = rested?.groups?.["rest"];
  if (filterText === undefined) {
    return undefined;
  }
  const parsed = parseCardFilterPredicates(
    { text: filterText },
    { powerSemantics: "current" },
  );
  if (parsed === undefined || parsed.rest.trim().length > 0) {
    return undefined;
  }

  return {
    filter: { ...parsed.filter, state: "rested" },
    evidence: ["filter:state:rested", ...parsed.evidence],
  };
}
