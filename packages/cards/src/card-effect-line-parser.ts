import { parseAndConnector, parseThenConnector } from "./connectors/index.js";
import {
  parseOpponentRestedCharactersCondition,
  parseTrashCountCondition,
} from "./conditions/index.js";
import {
  parseImplicitPermanentEntryPoint,
  parseRecognizedUnsupportedEntryPoint,
  parseSupportedEntryPoint,
} from "./entry-points/index.js";
import { parseExpression } from "./expression-parser.js";
import {
  parseDrawInstruction,
  parseOpponentEffectFieldRemovalProtectionInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseRestOpponentCharactersInstruction,
  parseThisCharacterKeywordGrantInstruction,
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
  conditionalContinuousExpressionParser,
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

const conditionParsers = [
  parseOpponentRestedCharactersCondition,
  parseTrashCountCondition,
] as const;

const continuousInstructionParsers = [
  parseOpponentEffectFieldRemovalProtectionInstruction,
  parseThisCharacterKeywordGrantInstruction,
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
  entryPoints: [
    parseSupportedEntryPoint,
    parseRecognizedUnsupportedEntryPoint,
    parseImplicitPermanentEntryPoint,
  ],
  markers: [parseOncePerTurnMarker],
  expressions: [
    conditionalContinuousExpressionParser({
      conditions: conditionParsers,
      connectors: [parseAndConnector],
      instructions: continuousInstructionParsers,
    }),
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
