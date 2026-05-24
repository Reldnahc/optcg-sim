import type { Comparator } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface CountComparisonParseResult {
  readonly op: Comparator;
  readonly value: number;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export function parseLeadingCountComparison(
  input: ParseInput,
): CountComparisonParseResult | undefined {
  const match =
    /^(?<value>[1-9]\d*) (?<direction>or more|or less)\b\s*(?<rest>.*)$/i.exec(
      input.text,
    );
  const valueText = match?.groups?.["value"];
  const direction = match?.groups?.["direction"];
  const restText = match?.groups?.["rest"];
  if (valueText === undefined || direction === undefined) {
    return undefined;
  }

  const op: Comparator = direction.toLowerCase() === "or more" ? "gte" : "lte";
  return {
    op,
    value: Number.parseInt(valueText, 10),
    evidence: [
      op === "gte" ? "condition:comparator:gte" : "condition:comparator:lte",
      "condition:threshold:positiveInteger",
    ],
    rest: restText?.trim() ?? "",
  };
}
