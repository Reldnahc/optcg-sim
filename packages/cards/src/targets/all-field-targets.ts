import type { Target } from "@optcg/types";

import { parseAllCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface AllFieldTargetParseResult {
  readonly target: Target;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export function parseAllFieldTarget(
  input: ParseInput,
): AllFieldTargetParseResult | undefined {
  const cardinality = parseAllCardinality(input);
  if (cardinality === undefined) {
    return undefined;
  }

  const ownership = parseFieldTargetOwnership(cardinality.rest);
  if (ownership === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: ownership.rest });
  if (predicates === undefined) {
    return undefined;
  }

  return {
    target: {
      type: "all",
      zone: "characterArea",
      player: ownership.player,
      filter: predicates.filter,
    },
    evidence: [
      ...cardinality.evidence,
      ...ownership.evidence,
      "zone:characterArea",
      ...predicates.evidence,
    ],
    rest: predicates.rest,
  };
}

function parseFieldTargetOwnership(text: string):
  | {
      readonly player: "self";
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined {
  const match = /^of your\s+(?<rest>.+)$/i.exec(text);
  const rest = match?.groups?.["rest"];
  if (rest === undefined) {
    return undefined;
  }

  return {
    player: "self",
    evidence: ["player:self"],
    rest: rest.trim(),
  };
}
