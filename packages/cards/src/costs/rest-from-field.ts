import type { OptionalCost } from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";
import { parseFieldCostFilter } from "./field-cost-filter.js";

type RestFromFieldCost = Extract<OptionalCost, { type: "restFromField" }>;

export interface RestFromFieldCostParseResult {
  readonly cost: RestFromFieldCost;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export function parseRestFromFieldCost(
  input: ParseInput,
): RestFromFieldCostParseResult | undefined {
  const match = /^rest\s+(?<rest>.+)$/iu.exec(input.text);
  const afterRest = match?.groups?.["rest"];
  if (afterRest === undefined) {
    return undefined;
  }

  const cardinality = parseExactCardinality({
    text: normalizeLeaderOrStageRestCost(afterRest),
  });
  if (cardinality === undefined) {
    return undefined;
  }

  const targetMatch = /^of your (?<filter>.+)$/iu.exec(cardinality.rest);
  const filterText = targetMatch?.groups?.["filter"];
  if (filterText === undefined) {
    return undefined;
  }

  const fieldFilter = parseFieldCostFilter({ text: filterText });
  if (fieldFilter === undefined) {
    return undefined;
  }

  return {
    cost: {
      type: "restFromField",
      count: cardinality.count,
      chooser: "self",
      ...(Object.keys(fieldFilter.filter).length === 0
        ? {}
        : { filter: fieldFilter.filter }),
      optional: true,
    },
    evidence: [
      "cost:restFromField",
      ...cardinality.evidence,
      "chooser:self",
      "player:self",
      ...fieldFilter.evidence,
    ],
    rest: "",
  };
}

function normalizeLeaderOrStageRestCost(text: string): string {
  return text
    .replace(/^your 1 Leader$/iu, "1 of your Leader")
    .replace(/^your Leader$/iu, "1 of your Leader")
    .replace(
      /^your Leader or 1 of your Stage cards?$/iu,
      "1 of your Leader or Stage cards",
    );
}
