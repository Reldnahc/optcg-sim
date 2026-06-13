import type { OptionalCost } from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";
import { parseFieldCostFilter } from "./field-cost-filter.js";

type KoFromFieldCost = Extract<OptionalCost, { type: "koFromField" }>;

export interface KoFromFieldCostParseResult {
  readonly cost: KoFromFieldCost;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export function parseKoFromFieldCost(
  input: ParseInput,
): KoFromFieldCostParseResult | undefined {
  const match = /^K\.O\.\s+(?<rest>.+)$/iu.exec(input.text);
  const afterKo = match?.groups?.["rest"];
  if (afterKo === undefined) {
    return undefined;
  }

  const cardinality = parseExactCardinality({ text: afterKo });
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
      type: "koFromField",
      count: cardinality.count,
      chooser: "self",
      ...(Object.keys(fieldFilter.filter).length === 0
        ? {}
        : { filter: fieldFilter.filter }),
      optional: true,
    },
    evidence: [
      "cost:koFromField",
      ...cardinality.evidence,
      "chooser:self",
      "player:self",
      "zone:characterArea",
      ...fieldFilter.evidence,
    ],
    rest: "",
  };
}
