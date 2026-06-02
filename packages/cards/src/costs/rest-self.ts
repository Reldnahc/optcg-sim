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
  const match = /^rest this (?<target>card|Character|Leader)$/i.exec(
    input.text,
  );
  const target = match?.groups?.["target"];
  if (target === undefined) {
    return undefined;
  }

  return {
    cost: { type: "restSelf", optional: true },
    evidence: [
      "cost:restSelf",
      target.toLowerCase() === "character"
        ? "target:thisCharacter"
        : "target:thisCard",
    ],
    rest: "",
  };
}
