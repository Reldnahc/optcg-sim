import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface TopDeckLookParseResult {
  readonly count: number;
  readonly rest: string;
  readonly evidence: readonly PrimitiveEvidence[];
}

export function parseTopDeckLook(
  input: ParseInput,
): TopDeckLookParseResult | undefined {
  const match =
    /^Look at (?<count>\d+) cards from the top of your deck;\s+(?<rest>.+)$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const rest = match?.groups?.["rest"];
  if (countText === undefined || rest === undefined) {
    return undefined;
  }

  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count <= 0) {
    return undefined;
  }

  return {
    count,
    rest,
    evidence: ["look:topDeck", "zone:deck", "count:positiveInteger"],
  };
}
