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

  return parseCompoundAndCondition(input, parsers);
}

function parseCompoundAndCondition(
  input: ParseInput,
  parsers: readonly ConditionParser[],
): ConditionParseResult | undefined {
  const parts = input.text
    .split(/\s+and\s+/iu)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) {
    return undefined;
  }

  const normalizedParts = normalizeCompoundConditionParts(parts);
  const parsedParts = normalizedParts.map((part) =>
    parseConditionFromSet({ text: part }, parsers),
  );
  if (parsedParts.some((part) => part === undefined)) {
    return undefined;
  }
  const conditions = parsedParts.map((part) => part?.condition);
  if (conditions.some((condition) => condition === undefined)) {
    return undefined;
  }

  return {
    condition: {
      type: "and",
      conditions: conditions.filter(
        (condition): condition is NonNullable<typeof condition> =>
          condition !== undefined,
      ),
    },
    evidence: [
      ...parsedParts.flatMap((part) => part?.evidence ?? []),
      "composition:conditionAnd",
    ],
    rest: "",
  };
}

function normalizeCompoundConditionParts(parts: readonly string[]): string[] {
  const first = parts[0]?.toLowerCase() ?? "";
  if (!first.startsWith("you have ")) {
    return [...parts];
  }
  return parts.map((part, index) =>
    index > 0 && /^(?:a|an)\s+/iu.test(part) ? `you have ${part}` : part,
  );
}
