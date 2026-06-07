import {
  parseEffectLine,
  parseEffectLineDetailed,
  parseEffectLinesDetailed,
} from "../orchestrator.js";
import type {
  ParsedEffectLine,
  ParsedRuntimeEffectLine,
  ParseCardEffectLineResult,
  ParseFailureDiagnostic,
} from "../types.js";
import { defaultRegistry } from "./expression-registry.js";

export function parseCardEffectLine(
  text: string,
): ParsedEffectLine | undefined {
  return parseEffectLine(text, defaultRegistry);
}

export function parseCardEffectLines(text: string): ParsedRuntimeEffectLine[] {
  const result = parseEffectLinesDetailed(text, defaultRegistry);
  return result.ok
    ? result.value.filter(
        (value): value is ParsedRuntimeEffectLine => value.kind !== "metadata",
      )
    : [];
}

export function parseCardEffectLinesDetailed(
  text: string,
):
  | { readonly ok: true; readonly value: readonly ParsedEffectLine[] }
  | { readonly ok: false; readonly diagnostic: ParseFailureDiagnostic } {
  return parseEffectLinesDetailed(text, defaultRegistry);
}

export function parseCardEffectLineDetailed(
  text: string,
): ParseCardEffectLineResult {
  const result = parseEffectLineDetailed(text, defaultRegistry);
  return result.ok ? result : { ok: false, diagnostic: result.diagnostic };
}
