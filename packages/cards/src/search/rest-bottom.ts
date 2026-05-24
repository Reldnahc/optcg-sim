import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface RestBottomParseResult {
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export function parseRestToBottomAnyOrder(
  input: ParseInput,
): RestBottomParseResult | undefined {
  const match =
    /^Then, place the rest at the bottom of your deck in any order\.?$/i.exec(
      input.text,
    );
  if (match === null) {
    return undefined;
  }

  return {
    evidence: ["remaining:rest", "remaining:bottomDeck", "order:anyOrder"],
    rest: "",
  };
}
