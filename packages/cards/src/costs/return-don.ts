import type { EffectBlockCost } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

type ReturnDonCost = Extract<EffectBlockCost, { type: "returnDon" }>;

export interface CostParseResult {
  readonly cost: ReturnDonCost;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const returnDonCostPrimitive = {
  primitiveId: "cost:returnDon",
  matches: [{ id: "don-minus-n" }],
} as const;

export function parseReturnDonCost(
  input: ParseInput,
): CostParseResult | undefined {
  const match = /^DON!!\s*[−-](?<count>[1-9]\d*):\s*(?<rest>.*)$/i.exec(
    input.text,
  );
  const countText = match?.groups?.["count"];
  const restText = match?.groups?.["rest"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    cost: { type: "returnDon", count: Number.parseInt(countText, 10) },
    evidence: ["cost:returnDon", "count:positiveInteger"],
    rest: restText?.trim() ?? "",
  };
}
