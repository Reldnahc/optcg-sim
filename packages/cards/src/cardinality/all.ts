import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface AllCardinalityParseResult {
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const allCardinalityPrimitive: PrimitivePatternDefinition<AllCardinalityParseResult> =
  {
    primitiveId: "cardinality:all",
    matches: [
      {
        id: "all",
        pattern: /^all\b\s*(?<rest>.*)$/i,
        build: (groups) => ({
          evidence: ["cardinality:all"],
          rest: groups["rest"]?.trim() ?? "",
        }),
      },
    ],
  };

export function parseAllCardinality(
  input: ParseInput,
): AllCardinalityParseResult | undefined {
  return parsePrimitivePattern(input, allCardinalityPrimitive);
}
