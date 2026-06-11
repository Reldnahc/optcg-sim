import type { OptionalCost } from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

type TrashFromFieldCost = Extract<OptionalCost, { type: "trashFromField" }>;

export interface TrashFromFieldCostParseResult {
  readonly cost: TrashFromFieldCost;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export function parseTrashFromFieldCost(
  input: ParseInput,
): TrashFromFieldCostParseResult | undefined {
  const match = /^trash\s+(?<rest>.+)$/iu.exec(input.text);
  const afterTrash = match?.groups?.["rest"];
  if (afterTrash === undefined) {
    return undefined;
  }

  const cardinality = parseExactCardinality({ text: afterTrash });
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
      type: "trashFromField",
      count: cardinality.count,
      chooser: "self",
      ...(Object.keys(predicates.filter).length === 0
        ? {}
        : { filter: predicates.filter }),
      optional: true,
    },
    evidence: [
      "cost:trashFromField",
      ...cardinality.evidence,
      "chooser:self",
      "player:self",
      "zone:characterArea",
      "zone:stageArea",
      ...predicates.evidence,
    ],
    rest: "",
  };
}
