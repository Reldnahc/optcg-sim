import type { Cardinality } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface CardinalityParseResult {
  readonly cardinality: Cardinality;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const upToCardinalityPrimitive = {
  primitiveId: "cardinality:upTo",
  matches: [{ id: "up-to-n" }],
} as const;

export function parseUpToCardinality(
  input: ParseInput,
): CardinalityParseResult | undefined {
  const match =
    /^(?:a total of )?up to (?:a total of )?(?<count>[1-9]\d*)\b\s*(?<rest>.*)$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const restText = match?.groups?.["rest"];
  if (countText === undefined) {
    return undefined;
  }

  const count = Number.parseInt(countText, 10);
  return {
    cardinality: { mode: "upTo", min: 0, max: count },
    evidence: ["cardinality:upTo", "count:positiveInteger"],
    rest: restText?.trim() ?? "",
  };
}
