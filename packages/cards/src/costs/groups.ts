import type { ParseInput } from "../types.js";

export type CostParser<TResult> = (input: ParseInput) => TResult | undefined;

export function parseCostFromSet<TResult>(
  input: ParseInput,
  parsers: readonly CostParser<TResult>[],
): TResult | undefined {
  for (const parser of parsers) {
    const parsed = parser(input);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}
