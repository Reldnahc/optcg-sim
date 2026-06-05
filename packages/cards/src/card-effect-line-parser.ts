import type { Effect } from "@optcg/types";

import {
  parseAndConnector,
  parseSentenceConnector,
  parseThenConnector,
} from "./connectors/index.js";
import {
  parseDonFieldCountCondition,
  parseFieldCardCountCondition,
  parseHandCountCondition,
  parseLeaderColorCountCondition,
  parseLeaderNameCondition,
  parseLifeCountCondition,
  parseEitherPlayerLifeCountCondition,
  parseNoOtherNamedCharactersCondition,
  parseOnlyMatchingFieldCardsCondition,
  parseOpponentRestedCharactersCondition,
  parseRestedCardCountCondition,
  parseSelfFieldCountCondition,
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
  parseActivateSelectedEventInstruction,
  parseAddActiveDonFromDonDeckInstruction,
  parseAddFromTrashToHandInstruction,
  parseAddRestedDonFromDonDeckInstruction,
  parseAttachRestedDonInstruction,
  parseSetFieldActiveInstruction,
  parseSetDonActiveInstruction,
  parseHandToDeckBottomInstruction,
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
  parseHandCounterSetInstruction,
  parseSelfCannotAttackInstruction,
  parsePreventOpponentCharactersAttackInstruction,
  parsePreventOpponentCharactersRefreshInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseRestOpponentCharactersOrDonCardsInstruction,
  parseRestOpponentLeaderOrCharactersInstruction,
  parsePlayFromTrashInstruction,
  parsePlaySourceInstruction,
  parsePlaceAtOwnerDeckBottomInstruction,
  parsePreventDrawInstruction,
  parseRevealTopInstruction,
  parseRestOpponentCharactersInstruction,
  parseReturnToOwnerHandInstruction,
  parseSetBasePowerInstruction,
  parseTargetedKeywordGrantInstruction,
  parseThisCharacterKeywordGrantInstruction,
  parseTrashInstruction,
  parseTrashFromDeckTopInstruction,
  parseTrashFromHandInstruction,
  parseWinGameInstruction,
  parseYourLeaderConditionalPowerInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
  parsePlayFromHandInstruction,
  parsePreventDonActivationInstruction,
  parsePreventPlayInstruction,
  selectPowerThenPreventBlockerActivationExpressionParser,
} from "./instructions/index.js";
import {
  parseAttachedDonMarker,
  parseOncePerTurnMarker,
} from "./markers/index.js";
import {
  parseAnyCopiesOfThisCardRuleLine,
  parseDonDeckSizeRuleLine,
} from "./metadata-lines/index.js";
import {
  parseEffectLine,
  parseEffectLineDetailed,
  parseEffectLinesDetailed,
  type EffectLineParserRegistry,
} from "./orchestrator.js";
import {
  conditionalContinuousExpressionParser,
  entryConditionContinuousExpressionParser,
  chooseOneExpressionParser,
  conditionalBlockExpressionParser,
  conditionalCostedBlockExpressionParser,
  conditionalExpressionSegmentParser,
  trailingConditionalExpressionSegmentParser,
  costedEffectExpressionParser,
  instructionExpressionSegmentParser,
  handTrashedByEffectReactionExpressionParser,
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
  ParsedRuntimeEffectLine,
  ParseCardEffectLineResult,
  ParseFailureDiagnostic,
  ParseInput,
} from "./types.js";

const isExplicitActionKeywordDuration = (
  effect: Effect,
): effect is Extract<Effect, { type: "giveKeyword" }> =>
  effect.type === "giveKeyword" &&
  effect.duration.type !== "whileSourceOnField" &&
  effect.duration.type !== "whileConditionTrue";

const isExplicitActionModifierSequence = (effect: Effect): boolean =>
  effect.type === "sequence" &&
  effect.effects.every((segment) => {
    const child = segment.effect;
    return (
      (child.type === "giveKeyword" || child.type === "modifyPower") &&
      child.duration.type !== "whileSourceOnField" &&
      child.duration.type !== "whileConditionTrue"
    );
  });

const isExplicitActionBasePowerEffect = (effect: Effect): boolean => {
  if (effect.type === "setBasePower") {
    return (
      effect.duration.type !== "whileSourceOnField" &&
      effect.duration.type !== "whileConditionTrue"
    );
  }
  return (
    effect.type === "sequence" &&
    effect.effects.every((segment) => {
      const child = segment.effect;
      return (
        (child.type === "setBasePower" || child.type === "sequence") &&
        isExplicitActionBasePowerEffect(child)
      );
    })
  );
};

const parseExplicitActionKeywordGrantInstruction = (input: ParseInput) => {
  const parsed = parseThisCharacterKeywordGrantInstruction(input, {
    condition: undefined,
  });
  if (
    parsed === undefined ||
    (!isExplicitActionKeywordDuration(parsed.effect) &&
      !isExplicitActionModifierSequence(parsed.effect))
  ) {
    return undefined;
  }
  return parsed;
};

const parseExplicitActionBasePowerInstruction = (input: ParseInput) => {
  const parsed = parseBasePowerBecomeInstruction(input, {
    condition: undefined,
  });
  if (parsed === undefined || !isExplicitActionBasePowerEffect(parsed.effect)) {
    return undefined;
  }
  return parsed;
};

const instructionParsers = [
  parseDrawInstruction,
  parseActivateReferencedEffectInstruction,
  parseActivateSelectedEventInstruction,
  parseAddFromTrashToHandInstruction,
  parseAddActiveDonFromDonDeckInstruction,
  parseAddRestedDonFromDonDeckInstruction,
  parseAttachRestedDonInstruction,
  parseSetFieldActiveInstruction,
  parseSetDonActiveInstruction,
  parseInvalidateEffectsInstruction,
  parseTrashFromHandInstruction,
  parseTrashFromDeckTopInstruction,
  parseLifeMovementInstruction,
  parseHandToDeckBottomInstruction,
  parseTopDeckPlacementInstruction,
  parseTrashInstruction,
  parsePlayFromHandInstruction,
  parsePlayFromTrashInstruction,
  parsePlaySourceInstruction,
  parsePreventDrawInstruction,
  parsePreventDonActivationInstruction,
  parsePreventPlayInstruction,
  parseRevealTopInstruction,
  parseModifyPowerInstruction,
  parseTargetedKeywordGrantInstruction,
  parseTargetedModifyCostInstruction,
  parseModifyCostInstruction,
  parseKoInstruction,
  parsePlaceAtOwnerDeckBottomInstruction,
  parseReturnToOwnerHandInstruction,
  parseRestOpponentLeaderOrCharactersInstruction,
  parseRestOpponentCharactersOrDonCardsInstruction,
  parseRestOpponentCharactersInstruction,
  parsePreventOpponentCharactersAttackInstruction,
  parsePreventOpponentCharactersRefreshInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseWinGameInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
  parseExplicitActionKeywordGrantInstruction,
  parseExplicitActionBasePowerInstruction,
] as const;

const conditionParsers = [
  parseDonFieldCountCondition,
  parseHandCountCondition,
  parseOpponentRestedCharactersCondition,
  parseRestedCardCountCondition,
  parseSelfFieldCountCondition,
  parseTrashCountCondition,
  parseEitherPlayerLifeCountCondition,
  parseLifeCountCondition,
  parseLeaderColorCountCondition,
  parseLeaderNameCondition,
  parseFieldCardCountCondition,
  parseNoOtherNamedCharactersCondition,
  parseOnlyMatchingFieldCardsCondition,
  parseTurnCountCondition,
] as const;

const continuousInstructionParsers = [
  parseOpponentEffectFieldRemovalProtectionInstruction,
  parseThisCharacterKeywordGrantInstruction,
  parseSelfCannotAttackInstruction,
  parseYourLeaderConditionalPowerInstruction,
  parseSetBasePowerInstruction,
  parseBasePowerBecomeInstruction,
  parseHandCounterSetInstruction,
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
      trailingConditionalExpressionSegmentParser({
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

const defaultRegistry = {
  metadataLines: [parseAnyCopiesOfThisCardRuleLine, parseDonDeckSizeRuleLine],
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
    chooseOneExpressionParser({
      conditions: conditionParsers,
      expressions: [
        revealTopPlayRestedExpressionParser,
        searchRevealExpressionParser,
        generalExpressionParser,
      ],
    }),
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
    handTrashedByEffectReactionExpressionParser({
      expressions: [generalExpressionParser],
    }),
    opponentEventOrBlockerActivatedExpressionParser({
      expressions: [
        conditionalBlockExpressionParser({
          conditions: conditionParsers,
          connectors: [parseThenConnector, parseAndConnector],
          instructions: instructionParsers,
        }),
        generalExpressionParser,
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
      expressions: [searchRevealExpressionParser],
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
    selectPowerThenPreventBlockerActivationExpressionParser,
    revealTopPlayRestedExpressionParser,
    searchRevealExpressionParser,
    generalExpressionParser,
  ],
} satisfies EffectLineParserRegistry;
