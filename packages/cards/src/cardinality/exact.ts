import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface ExactCardinalityParseResult {
  readonly count: number;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const exactCardinalityPrimitive: PrimitivePatternDefinition<ExactCardinalityParseResult> =
  {
    primitiveId: "cardinality:exact",
    matches: [
      {
        id: "exact-positive-integer",
        pattern: /^(?<count>[1-9]\d*)\b\s*(?<rest>.*)$/i,
        build: (groups) => ({
          count: Number.parseInt(groups["count"] ?? "", 10),
          evidence: ["cardinality:exact", "count:positiveInteger"],
          rest: groups["rest"]?.trim() ?? "",
        }),
      },
    ],
  };

export function parseExactCardinality(
  input: ParseInput,
): ExactCardinalityParseResult | undefined {
  return parsePrimitivePattern(input, exactCardinalityPrimitive);
}
