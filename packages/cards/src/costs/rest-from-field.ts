import type { OptionalCost } from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

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

  const cardinality = parseExactCardinality({ text: afterRest });
  if (cardinality === undefined) {
    return undefined;
  }

  const targetMatch = /^of your (?<filter>.+)$/iu.exec(cardinality.rest);
  const filterText = targetMatch?.groups?.["filter"];
  if (filterText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: filterText },
    { powerSemantics: "current" },
  );
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  return {
    cost: {
      type: "restFromField",
      count: cardinality.count,
      chooser: "self",
      ...(Object.keys(predicates.filter).length === 0
        ? {}
        : { filter: predicates.filter }),
      optional: true,
    },
    evidence: [
      "cost:restFromField",
      ...cardinality.evidence,
      "chooser:self",
      "player:self",
      ...predicates.evidence,
    ],
    rest: "",
  };
}
