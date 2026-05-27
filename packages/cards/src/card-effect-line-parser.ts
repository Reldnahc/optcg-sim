import { parseAndConnector, parseThenConnector } from "./connectors/index.js";
import {
  parseDonFieldCountCondition,
  parseLeaderNameCondition,
  parseOnlyMatchingFieldCardsCondition,
  parseOpponentRestedCharactersCondition,
  parseTrashCountCondition,
} from "./conditions/index.js";
import {
  parseImplicitPermanentEntryPoint,
  parseRecognizedUnsupportedEntryPoint,
  parseRulesStartOfGameEntryPoint,
  parseSupportedEntryPoint,
} from "./entry-points/index.js";
import { parseExpression } from "./expression-parser.js";
import {
  parseActivateReferencedEffectInstruction,
  parseAddFromTrashToHandInstruction,
  parseDrawInstruction,
  parseInvalidateEffectsInstruction,
  parseKoInstruction,
  parseModifyCostInstruction,
  parseModifyPowerInstruction,
  parseOpponentEffectFieldRemovalProtectionInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parsePlayFromTrashInstruction,
  parseRestOpponentCharactersInstruction,
  parseSetBasePowerInstruction,
  parseThisCharacterKeywordGrantInstruction,
  parseTrashAllYourCharactersInstruction,
  parseTrashFromHandInstruction,
  parseYourLeaderConditionalPowerInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
  parsePlayFromHandInstruction,
} from "./instructions/index.js";
import { parseOncePerTurnMarker } from "./markers/index.js";
import {
  parseEffectLine,
  parseEffectLineDetailed,
  type EffectLineParserRegistry,
} from "./orchestrator.js";
import {
  conditionalContinuousExpressionParser,
  conditionalBlockExpressionParser,
  conditionalCostedBlockExpressionParser,
  conditionalExpressionSegmentParser,
  costedEffectExpressionParser,
  instructionExpressionSegmentParser,
  optionalCostedEffectExpressionParser,
  playStageFromDeckExpressionParser,
  searchRevealExpressionParser,
  syntheticInstructionSegmentParser,
} from "./segments/index.js";
import type {
  ParsedEffectLine,
  ParseCardEffectLineResult,
  ParseInput,
} from "./types.js";

const instructionParsers = [
  parseDrawInstruction,
  parseActivateReferencedEffectInstruction,
  parseAddFromTrashToHandInstruction,
  parseInvalidateEffectsInstruction,
  parseTrashFromHandInstruction,
  parseTrashAllYourCharactersInstruction,
  parsePlayFromHandInstruction,
  parsePlayFromTrashInstruction,
  parseModifyPowerInstruction,
  parseModifyCostInstruction,
  parseKoInstruction,
  parseRestOpponentCharactersInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
] as const;

const conditionParsers = [
  parseDonFieldCountCondition,
  parseOpponentRestedCharactersCondition,
  parseTrashCountCondition,
  parseLeaderNameCondition,
  parseOnlyMatchingFieldCardsCondition,
] as const;

const continuousInstructionParsers = [
  parseOpponentEffectFieldRemovalProtectionInstruction,
  parseThisCharacterKeywordGrantInstruction,
  parseYourLeaderConditionalPowerInstruction,
  parseSetBasePowerInstruction,
] as const;

const generalExpressionParser = (input: ParseInput) =>
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
  });

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
    parseRulesStartOfGameEntryPoint,
    parseSupportedEntryPoint,
    parseRecognizedUnsupportedEntryPoint,
    parseImplicitPermanentEntryPoint,
  ],
  markers: [parseOncePerTurnMarker],
  expressions: [
    conditionalCostedBlockExpressionParser({
      conditions: conditionParsers,
      expressions: [
        optionalCostedEffectExpressionParser({
          instructions: instructionParsers,
          expressions: [searchRevealExpressionParser, generalExpressionParser],
        }),
      ],
    }),
    conditionalContinuousExpressionParser({
      conditions: conditionParsers,
      connectors: [parseAndConnector],
      instructions: continuousInstructionParsers,
    }),
    conditionalBlockExpressionParser({
      conditions: conditionParsers,
      connectors: [parseThenConnector, parseAndConnector],
      instructions: instructionParsers,
    }),
    costedEffectExpressionParser({
      instructions: instructionParsers,
      expressions: [searchRevealExpressionParser, generalExpressionParser],
    }),
    optionalCostedEffectExpressionParser({
      instructions: instructionParsers,
      expressions: [searchRevealExpressionParser, generalExpressionParser],
    }),
    playStageFromDeckExpressionParser,
    searchRevealExpressionParser,
    generalExpressionParser,
  ],
} satisfies EffectLineParserRegistry;
