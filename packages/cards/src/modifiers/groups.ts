import type { ParseInput, PrimitiveEvidence } from "../types.js";
import {
  parseNegativePowerModifier,
  parsePositivePowerModifier,
  type PowerModifierParseResult,
} from "./power.js";

export interface ModifierParseResult {
  readonly value: number;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export type ModifierParser<
  TResult extends ModifierParseResult = ModifierParseResult,
> = (input: ParseInput) => TResult | undefined;

export function parseModifierFromSet<
  TResult extends ModifierParseResult = ModifierParseResult,
>(
  input: ParseInput,
  parsers: readonly ModifierParser<TResult>[],
): TResult | undefined {
  for (const parser of parsers) {
    const parsed = parser(input);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

export const allPowerModifierParsers: readonly ModifierParser<PowerModifierParseResult>[] =
  [parsePositivePowerModifier, parseNegativePowerModifier] as const;
