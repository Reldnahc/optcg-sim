import type { EffectBlockCost } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";
import type { CostParseResult as SequenceCostParseResult } from "./rest-don.js";

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
  const match =
    /^DON!!\s*[-\u2212](?<count>[1-9]\d*)(?:\s*\([^)]*\))?:\s*(?<rest>[\s\S]*)$/iu.exec(
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

export function parseReturnDonSequenceCost(
  input: ParseInput,
): SequenceCostParseResult | undefined {
  const match = /^DON!!\s*[-\u2212](?<count>[1-9]\d*)$/iu.exec(input.text);
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  return {
    cost: {
      type: "returnDon",
      count: Number.parseInt(countText, 10),
      optional: true,
    },
    evidence: ["cost:returnDon", "count:positiveInteger"],
    rest: "",
  };
}
