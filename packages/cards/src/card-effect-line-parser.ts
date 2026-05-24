import { parseAndConnector, parseThenConnector } from "./connectors/index.js";
import { parseOpponentRestedCharactersCondition } from "./conditions/index.js";
import {
  parseRecognizedUnsupportedEntryPoint,
  parseSupportedEntryPoint,
} from "./entry-points/index.js";
import { parseExpression } from "./expression-parser.js";
import {
  parseDrawInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseRestOpponentCharactersInstruction,
  parseTrashFromHandInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
} from "./instructions/index.js";
import { parseOncePerTurnMarker } from "./markers/index.js";
import {
  parseEffectLine,
  parseEffectLineDetailed,
  type EffectLineParserRegistry,
} from "./orchestrator.js";
import {
  conditionalExpressionSegmentParser,
  instructionExpressionSegmentParser,
  syntheticInstructionSegmentParser,
} from "./segments/index.js";
import type { ParsedEffectLine, ParseCardEffectLineResult } from "./types.js";

const instructionParsers = [
  parseDrawInstruction,
  parseTrashFromHandInstruction,
  parseRestOpponentCharactersInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
] as const;

const conditionParsers = [parseOpponentRestedCharactersCondition] as const;

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
        segments: [
          conditionalExpressionSegmentParser({
            conditions: conditionParsers,
            connectors: [parseAndConnector],
            instructions: instructionParsers,
          }),
          instructionExpressionSegmentParser({
            connectors: [parseAndConnector],
            instructions: instructionParsers,
          }),
          syntheticInstructionSegmentParser(instructionParsers),
        ],
      }),
  ],
} satisfies EffectLineParserRegistry;
