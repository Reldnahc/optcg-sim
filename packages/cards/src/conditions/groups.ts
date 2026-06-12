import type {
  ConditionParseResult,
  ConditionParser,
  ParseInput,
} from "../types.js";

export function parseConditionFromSet(
  input: ParseInput,
  parsers: readonly ConditionParser[],
): ConditionParseResult | undefined {
  for (const parser of parsers) {
    const parsed = parser(input);
    if (parsed !== undefined && parsed.rest.length === 0) {
      return parsed;
    }
  }

  return undefined;
}
