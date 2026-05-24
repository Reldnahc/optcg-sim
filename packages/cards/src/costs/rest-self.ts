import type { OptionalCost } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface RestSelfCostParseResult {
  readonly cost: Extract<OptionalCost, { type: "restSelf" }>;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export function parseRestSelfCost(
  input: ParseInput,
): RestSelfCostParseResult | undefined {
  if (!/^rest this card$/i.test(input.text)) {
    return undefined;
  }

  return {
    cost: { type: "restSelf", optional: true },
    evidence: ["cost:restSelf", "target:thisCard"],
    rest: "",
  };
}
