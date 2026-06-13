import type { CardFilter } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface FieldCostFilterParseResult {
  readonly evidence: readonly PrimitiveEvidence[];
  readonly filter: CardFilter;
}

export function parseFieldCostFilter(
  input: ParseInput,
): FieldCostFilterParseResult | undefined {
  const leaderOrStageMatch = /^Leader or Stage cards?$/iu.exec(input.text);
  if (leaderOrStageMatch !== null) {
    return {
      evidence: ["filter:category:leader", "filter:category:stage"],
      filter: { categories: ["leader", "stage"] },
    };
  }

  const direct = parseCardFilterPredicates(
    { text: input.text },
    { powerSemantics: "current" },
  );
  if (direct !== undefined && direct.rest.length === 0) {
    return {
      evidence: direct.evidence,
      filter: direct.filter,
    };
  }

  const categoryMatch =
    /^(?<category>Characters?|Stages?)\b\s*(?<rest>.*)$/iu.exec(input.text);
  const categoryText = categoryMatch?.groups?.["category"]?.toLowerCase();
  const rest = categoryMatch?.groups?.["rest"]?.trim();
  if (categoryText === undefined || rest === undefined || rest.length === 0) {
    return undefined;
  }

  const category = categoryText.startsWith("character")
    ? ("character" as const)
    : ("stage" as const);
  const predicates = parseCardFilterPredicates(
    { text: rest },
    { powerSemantics: "current" },
  );
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  return {
    evidence: [
      category === "character"
        ? "filter:category:character"
        : "filter:category:stage",
      ...predicates.evidence,
    ],
    filter: {
      ...predicates.filter,
      categories: [category],
    },
  };
}
