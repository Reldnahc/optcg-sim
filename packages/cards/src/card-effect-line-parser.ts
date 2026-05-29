import type { Effect } from "@optcg/types";

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
  parseReplacementEntryPoint,
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
  parseReturnToOwnerHandInstruction,
  parseSetBasePowerInstruction,
  parseThisCharacterKeywordGrantInstruction,
  parseTrashAllYourCharactersInstruction,
  parseTrashFromDeckTopInstruction,
  parseTrashFromHandInstruction,
  parseYourLeaderConditionalPowerInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
  parsePlayFromHandInstruction,
} from "./instructions/index.js";
import {
  parseAttachedDonMarker,
  parseOncePerTurnMarker,
} from "./markers/index.js";
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
  replacementInsteadExpressionParser,
  returnToOwnerHandCostedEffectExpressionParser,
  revealTopPlayRestedExpressionParser,
  searchRevealExpressionParser,
  syntheticInstructionSegmentParser,
} from "./segments/index.js";
import type {
  ParsedEffectLine,
  ParseCardEffectLineResult,
  ParseInput,
} from "./types.js";

const isExplicitActionKeywordDuration = (
  effect: Effect,
): effect is Extract<Effect, { type: "giveKeyword" }> =>
  effect.type === "giveKeyword" &&
  effect.duration.type !== "whileSourceOnField" &&
  effect.duration.type !== "whileConditionTrue";

const parseExplicitActionKeywordGrantInstruction = (input: ParseInput) => {
  const parsed = parseThisCharacterKeywordGrantInstruction(input, {
    condition: undefined,
  });
  if (parsed === undefined || !isExplicitActionKeywordDuration(parsed.effect)) {
    return undefined;
  }
  return parsed;
};

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
  parseReturnToOwnerHandInstruction,
  parseRestOpponentCharactersInstruction,
  parsePreventOpponentCharactersRefreshInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
  parseExplicitActionKeywordGrantInstruction,
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
    parseReplacementEntryPoint,
    parseImplicitPermanentEntryPoint,
  ],
  markers: [parseAttachedDonMarker, parseOncePerTurnMarker],
  expressions: [
    conditionalCostedBlockExpressionParser({
      conditions: conditionParsers,
      expressions: [
        returnToOwnerHandCostedEffectExpressionParser({
          conditions: conditionParsers,
          instructions: instructionParsers,
          expressions: [
            revealTopPlayRestedExpressionParser,
            searchRevealExpressionParser,
            generalExpressionParser,
          ],
        }),
        optionalCostedEffectExpressionParser({
          instructions: instructionParsers,
          expressions: [
            revealTopPlayRestedExpressionParser,
            searchRevealExpressionParser,
            generalExpressionParser,
          ],
        }),
      ],
    }),
    returnToOwnerHandCostedEffectExpressionParser({
      conditions: conditionParsers,
      instructions: instructionParsers,
      expressions: [
        revealTopPlayRestedExpressionParser,
        searchRevealExpressionParser,
        generalExpressionParser,
      ],
    }),
    replacementInsteadExpressionParser,
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
      expressions: [
        revealTopPlayRestedExpressionParser,
        searchRevealExpressionParser,
        generalExpressionParser,
      ],
    }),
    playStageFromDeckExpressionParser,
    revealTopPlayRestedExpressionParser,
    searchRevealExpressionParser,
    generalExpressionParser,
  ],
} satisfies EffectLineParserRegistry;
