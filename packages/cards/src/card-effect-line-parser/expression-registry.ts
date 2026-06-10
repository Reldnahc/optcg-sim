import {
  parseAndConnector,
  parseSentenceConnector,
  parseThenConnector,
} from "../connectors/index.js";
import { parseExpression } from "../expression-parser.js";
import {
  parseActivatedReactionEntryPoint,
  parseImplicitPermanentEntryPoint,
  parseImplicitReactionEntryPoint,
  parseRecognizedUnsupportedEntryPoint,
  parseReplacementEntryPoint,
  parseRulesStartOfGameEntryPoint,
  parseSupportedEntryPoint,
  parseTurnWindowedEntryPoint,
} from "../entry-points/index.js";
import {
  parseAttachedDonMarker,
  parseOncePerTurnMarker,
} from "../markers/index.js";
import {
  parseAnyCopiesOfThisCardRuleLine,
  parseDonDeckSizeRuleLine,
} from "../metadata-lines/index.js";
import type { EffectLineParserRegistry } from "../orchestrator.js";
import {
  chooseOneExpressionParser,
  activatedReactionExpressionParser,
  conditionalBlockExpressionParser,
  conditionalContinuousExpressionParser,
  conditionalCostedBlockExpressionParser,
  conditionalExpressionSegmentParser,
  costedEffectExpressionParser,
  entryConditionContinuousExpressionParser,
  handTrashedByEffectReactionExpressionParser,
  instructionExpressionSegmentParser,
  lifeRemovedReactionExpressionParser,
  lookPlayFromTopExpressionParser,
  opponentEventOrBlockerActivatedExpressionParser,
  optionalCostedEffectExpressionParser,
  playStageFromDeckExpressionParser,
  replacementInsteadExpressionParser,
  returnToOwnerHandCostedEffectExpressionParser,
  revealTopPlayRestedExpressionParser,
  searchRevealExpressionParser,
  selectedBasePowerSnapshotExpressionParser,
  syntheticInstructionSegmentParser,
  trailingConditionalExpressionSegmentParser,
} from "../segments/index.js";
import {
  selectedAttackRetargetExpressionParser,
  selectPowerThenPreventBlockerActivationExpressionParser,
} from "../instructions/index.js";
import type { ParseInput } from "../types.js";
import {
  conditionParsers,
  continuousInstructionParsers,
  instructionParsers,
} from "./parser-groups.js";

const singleInstructionExpressionParser = (input: ParseInput) => {
  const parsed = syntheticInstructionSegmentParser(instructionParsers)(input);
  if (parsed === undefined) {
    return undefined;
  }
  return {
    effect: parsed.effect,
    evidence: parsed.evidence,
    rest: "",
    ...(parsed.presentationSpans === undefined
      ? {}
      : { presentationSpans: parsed.presentationSpans }),
  };
};

const generalExpressionParser = (input: ParseInput) =>
  parseExpression(input, {
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

const conditionalCostedBodyExpressionParser = (input: ParseInput) => {
  if (/\.\s+Then,\s+/u.test(input.text)) {
    return undefined;
  }
  const parsed = conditionalExpressionSegmentParser({
    conditions: conditionParsers,
    connectors: [parseThenConnector, parseAndConnector],
    instructions: instructionParsers,
  })(input);
  if (parsed === undefined) {
    return undefined;
  }
  return {
    effect: parsed.effect,
    evidence: parsed.evidence,
    rest: "",
    ...(parsed.presentationSpans === undefined
      ? {}
      : { presentationSpans: parsed.presentationSpans }),
  };
};

const costedExpressions = [
  lookPlayFromTopExpressionParser,
  revealTopPlayRestedExpressionParser,
  searchRevealExpressionParser,
  selectedAttackRetargetExpressionParser,
  conditionalCostedBodyExpressionParser,
  singleInstructionExpressionParser,
  generalExpressionParser,
] as const;

export const defaultRegistry = {
  metadataLines: [parseAnyCopiesOfThisCardRuleLine, parseDonDeckSizeRuleLine],
  entryPoints: [
    parseRulesStartOfGameEntryPoint,
    parseTurnWindowedEntryPoint,
    parseSupportedEntryPoint,
    parseRecognizedUnsupportedEntryPoint,
    parseReplacementEntryPoint,
    parseActivatedReactionEntryPoint,
    parseImplicitReactionEntryPoint,
    parseImplicitPermanentEntryPoint,
  ],
  markers: [parseAttachedDonMarker, parseOncePerTurnMarker],
  expressions: [
    chooseOneExpressionParser({
      conditions: conditionParsers,
      expressions: [
        lookPlayFromTopExpressionParser,
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
          expressions: costedExpressions,
        }),
        optionalCostedEffectExpressionParser({
          instructions: instructionParsers,
          expressions: costedExpressions,
        }),
      ],
    }),
    returnToOwnerHandCostedEffectExpressionParser({
      conditions: conditionParsers,
      instructions: instructionParsers,
      expressions: costedExpressions,
    }),
    replacementInsteadExpressionParser,
    activatedReactionExpressionParser({
      expressions: [
        returnToOwnerHandCostedEffectExpressionParser({
          conditions: conditionParsers,
          instructions: instructionParsers,
          expressions: costedExpressions,
        }),
        optionalCostedEffectExpressionParser({
          instructions: instructionParsers,
          expressions: costedExpressions,
        }),
        generalExpressionParser,
      ],
    }),
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
        singleInstructionExpressionParser,
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
      expressions: [
        lookPlayFromTopExpressionParser,
        searchRevealExpressionParser,
      ],
    }),
    costedEffectExpressionParser({
      instructions: instructionParsers,
      expressions: costedExpressions,
    }),
    optionalCostedEffectExpressionParser({
      instructions: instructionParsers,
      expressions: costedExpressions,
    }),
    playStageFromDeckExpressionParser,
    selectPowerThenPreventBlockerActivationExpressionParser,
    selectedAttackRetargetExpressionParser,
    selectedBasePowerSnapshotExpressionParser,
    lookPlayFromTopExpressionParser,
    revealTopPlayRestedExpressionParser,
    searchRevealExpressionParser,
    singleInstructionExpressionParser,
    generalExpressionParser,
  ],
} satisfies EffectLineParserRegistry;
