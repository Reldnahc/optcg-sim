import type { ParseInput, PrimitiveEvidence } from "./types.js";

export interface PrimitiveMatch<TResult> {
  readonly id: string;
  readonly pattern: RegExp;
  readonly build: (groups: Record<string, string | undefined>) => TResult;
}

export interface PrimitivePatternDefinition<TResult> {
  readonly primitiveId: PrimitiveEvidence;
  readonly matches: readonly PrimitiveMatch<TResult>[];
}

export function parsePrimitivePattern<TResult>(
  input: ParseInput,
  definition: PrimitivePatternDefinition<TResult>,
): TResult | undefined {
  for (const match of definition.matches) {
    const result = match.pattern.exec(input.text);
    if (result === null) {
      continue;
    }

    return match.build(result.groups ?? {});
  }

  return undefined;
}
