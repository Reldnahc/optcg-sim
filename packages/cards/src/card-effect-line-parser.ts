import { parseAndConnector, parseThenConnector } from "./connectors/index.js";
import {
  parseDonFieldCountCondition,
  parseHandCountCondition,
  parseLeaderNameCondition,
  parseLifeCountCondition,
  parseOnlyMatchingFieldCardsCondition,
  parseOpponentRestedCharactersCondition,
  parseTrashCountCondition,
  parseTurnCountCondition,
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
  parseAddActiveDonFromDonDeckInstruction,
  parseAddFromTrashToHandInstruction,
  parseAddRestedDonFromDonDeckInstruction,
  parseAttachRestedDonInstruction,
  parseSetDonActiveInstruction,
  parseTopDeckPlacementInstruction,
  parseDrawInstruction,
  parseInvalidateEffectsInstruction,
  parseKoInstruction,
  parseModifyCostInstruction,
  parseSelfHandModifyCostInstruction,
  parseTargetedModifyCostInstruction,
  parseModifyPowerInstruction,
  parseOpponentEffectFieldRemovalProtectionInstruction,
  parseBasePowerBecomeInstruction,
  parsePreventOpponentCharactersRefreshInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parsePlayFromTrashInstruction,
  parseRestOpponentCharactersInstruction,
  parseSetBasePowerInstruction,
  parseThisCharacterKeywordGrantInstruction,
  parseTrashAllYourCharactersInstruction,
  parseTrashFromDeckTopInstruction,
  parseTrashFromHandInstruction,
  parseYourLeaderConditionalPowerInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
  parsePlayFromHandInstruction,
} from "./instructions/index.js";
import { parseOncePerTurnMarker } from "./markers/index.js";
import { parseDonDeckSizeRuleLine } from "./metadata-lines/index.js";
import {
  parseEffectLine,
  parseEffectLineDetailed,
  type EffectLineParserRegistry,
} from "./orchestrator.js";
import {
  conditionalContinuousExpressionParser,
  entryConditionContinuousExpressionParser,
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
  parseAddActiveDonFromDonDeckInstruction,
  parseAddRestedDonFromDonDeckInstruction,
  parseAttachRestedDonInstruction,
  parseSetDonActiveInstruction,
  parseInvalidateEffectsInstruction,
  parseTrashFromHandInstruction,
  parseTrashFromDeckTopInstruction,
  parseTopDeckPlacementInstruction,
  parseTrashAllYourCharactersInstruction,
  parsePlayFromHandInstruction,
  parsePlayFromTrashInstruction,
  parseModifyPowerInstruction,
  parseTargetedModifyCostInstruction,
  parseModifyCostInstruction,
  parseKoInstruction,
  parseRestOpponentCharactersInstruction,
  parsePreventOpponentCharactersRefreshInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
] as const;

const conditionParsers = [
  parseDonFieldCountCondition,
  parseHandCountCondition,
  parseOpponentRestedCharactersCondition,
  parseTrashCountCondition,
  parseLifeCountCondition,
  parseLeaderNameCondition,
  parseOnlyMatchingFieldCardsCondition,
  parseTurnCountCondition,
] as const;

const continuousInstructionParsers = [
  parseOpponentEffectFieldRemovalProtectionInstruction,
  parseThisCharacterKeywordGrantInstruction,
  parseYourLeaderConditionalPowerInstruction,
  parseSetBasePowerInstruction,
  parseBasePowerBecomeInstruction,
  parseSelfHandModifyCostInstruction,
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
  metadataLines: [parseDonDeckSizeRuleLine],
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
    entryConditionContinuousExpressionParser({
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
