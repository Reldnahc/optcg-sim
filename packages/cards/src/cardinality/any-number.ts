import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface AnyNumberCardinality {
  readonly mode: "anyNumber";
  readonly min: 0;
  readonly max: "available";
}

export interface AnyNumberCardinalityParseResult {
  readonly cardinality: AnyNumberCardinality;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const parseAnyNumberCardinality = (
  input: ParseInput,
): AnyNumberCardinalityParseResult | undefined => {
  const match = /^any number of\b\s*(?<rest>.*)$/iu.exec(input.text);
  const rest = match?.groups?.["rest"];
  if (rest === undefined) {
    return undefined;
  }

  return {
    cardinality: { mode: "anyNumber", min: 0, max: "available" },
    evidence: ["cardinality:anyNumber", "count:anyNumber"],
    rest: rest.trim(),
  };
};
