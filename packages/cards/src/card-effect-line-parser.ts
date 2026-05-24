import { parseAndConnector, parseThenConnector } from "./connectors/index.js";
import {
  parseRecognizedUnsupportedEntryPoint,
  parseSupportedEntryPoint,
} from "./entry-points/index.js";
import { parseExpression } from "./expression-parser.js";
import {
  parseDrawInstruction,
  parseTrashFromHandInstruction,
} from "./instructions/index.js";
import { parseOncePerTurnMarker } from "./markers/index.js";
import {
  parseEffectLine,
  parseEffectLineDetailed,
  type EffectLineParserRegistry,
} from "./orchestrator.js";
import { syntheticInstructionSegmentParser } from "./segments/index.js";
import type { ParsedEffectLine, ParseCardEffectLineResult } from "./types.js";

const instructionParsers = [
  parseDrawInstruction,
  parseTrashFromHandInstruction,
] as const;

export function parseCardEffectLine(
  text: string,
): ParsedEffectLine | undefined {
  return parseEffectLine(text, defaultRegistry);
}

export function parseCardEffectLineDetailed(
  text: string,
): ParseCardEffectLineResult {
  const result = parseEffectLineDetailed(text, defaultRegistry);
  return result.ok ? result : { ok: false, diagnostic: result.diagnostic };
}

const defaultRegistry = {
  entryPoints: [parseSupportedEntryPoint, parseRecognizedUnsupportedEntryPoint],
  markers: [parseOncePerTurnMarker],
  expressions: [
    (input) =>
      parseExpression(input.text, {
        connectors: [parseThenConnector, parseAndConnector],
        segments: [syntheticInstructionSegmentParser(instructionParsers)],
      }),
  ],
} satisfies EffectLineParserRegistry;
