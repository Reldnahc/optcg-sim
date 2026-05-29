import type { Target, Zone } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface ReplacementFieldTargetParseResult {
  readonly target: Target;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export function parseYourFieldReplacementTarget(
  input: ParseInput,
): ReplacementFieldTargetParseResult | undefined {
  const ownership = /^your\s+(?<rest>.+)$/i.exec(input.text);
  const predicateText = ownership?.groups?.["rest"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: predicateText });
  const category = predicates?.filter.categories?.[0];
  if (
    predicates === undefined ||
    (category !== "character" && category !== "stage")
  ) {
    return undefined;
  }

  const zone: Zone = category === "stage" ? "stageArea" : "characterArea";
  return {
    target: {
      type: "all",
      zone,
      player: "self",
      filter: predicates.filter,
    },
    evidence: [
      "player:self",
      category === "stage" ? "target:yourStages" : "target:yourCharacters",
      zone === "stageArea" ? "zone:stageArea" : "zone:characterArea",
      ...predicates.evidence,
    ],
    rest: predicates.rest.trim(),
  };
}
