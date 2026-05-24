import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface CostTargetParseResult {
  readonly target: {
    readonly kind: "don";
    readonly owner: "self";
  };
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const yourDonCardsCostTargetPrimitive: PrimitivePatternDefinition<CostTargetParseResult> =
  {
    primitiveId: "target:yourDonCards",
    matches: [
      {
        id: "of-your-don-cards",
        pattern: /^of your DON!! cards?\b\s*(?<rest>.*)$/i,
        build: (groups) => ({
          target: { kind: "don", owner: "self" },
          evidence: ["target:yourDonCards", "player:self"],
          rest: groups["rest"]?.trim() ?? "",
        }),
      },
    ],
  };

export function parseYourDonCardsCostTarget(
  input: ParseInput,
): CostTargetParseResult | undefined {
  return parsePrimitivePattern(input, yourDonCardsCostTargetPrimitive);
}
