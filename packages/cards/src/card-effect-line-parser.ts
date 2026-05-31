import type { Effect } from "@optcg/types";

import {
  parseAndConnector,
  parseSentenceConnector,
  parseThenConnector,
} from "./connectors/index.js";
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
  parseImplicitReactionEntryPoint,
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
  parseLifeMovementInstruction,
  parseModifyCostInstruction,
  parseSelfHandModifyCostInstruction,
  parseTargetedModifyCostInstruction,
  parseModifyPowerInstruction,
  parseOpponentEffectFieldRemovalProtectionInstruction,
  parseBasePowerBecomeInstruction,
  parsePreventOpponentCharactersRefreshInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseRestOpponentLeaderOrCharactersInstruction,
  parsePlayFromTrashInstruction,
  parsePlaySourceInstruction,
  parsePreventDrawInstruction,
  parseRevealTopInstruction,
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
  lifeRemovedReactionExpressionParser,
  optionalCostedEffectExpressionParser,
  opponentEventOrBlockerActivatedExpressionParser,
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
  parseLifeMovementInstruction,
  parseTopDeckPlacementInstruction,
  parseTrashAllYourCharactersInstruction,
  parsePlayFromHandInstruction,
  parsePlayFromTrashInstruction,
  parsePlaySourceInstruction,
  parsePreventDrawInstruction,
  parseRevealTopInstruction,
  parseModifyPowerInstruction,
  parseTargetedModifyCostInstruction,
  parseModifyCostInstruction,
  parseKoInstruction,
  parseReturnToOwnerHandInstruction,
  parseRestOpponentLeaderOrCharactersInstruction,
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
    connectors: [parseThenConnector, parseSentenceConnector, parseAndConnector],
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
    parseImplicitReactionEntryPoint,
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
    lifeRemovedReactionExpressionParser({
      expressions: [generalExpressionParser],
    }),
    opponentEventOrBlockerActivatedExpressionParser({
      expressions: [generalExpressionParser],
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
