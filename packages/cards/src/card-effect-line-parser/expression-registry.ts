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
  parseDeckOutLossTimingRuleLine,
  parseDonDeckSizeRuleLine,
  parseNameAliasesRuleLine,
} from "../metadata-lines/index.js";
import type { EffectLineParserRegistry } from "../orchestrator.js";
import {
  applyEachContinuousExpressionParser,
  chooseOneExpressionParser,
  activatedReactionExpressionParser,
  conditionalBlockExpressionParser,
  conditionalContinuousExpressionParser,
  conditionalCostedBlockExpressionParser,
  conditionalExpressionSegmentParser,
  costedEffectExpressionParser,
  delayedEndOfTurnSegmentParser,
  entryConditionContinuousExpressionParser,
  handTrashedByEffectReactionExpressionParser,
  implicitEventReactionExpressionParser,
  instructionExpressionSegmentParser,
  lifeRemovedReactionExpressionParser,
  lookPlayFromTopExpressionParser,
  opponentEventOrBlockerActivatedExpressionParser,
  opponentOptionalCostExpressionParser,
  opponentOptionalCostSegmentParser,
  optionalCostedEffectExpressionParser,
  optionalCostedEffectSegmentParser,
  playStageFromDeckExpressionParser,
  replacementInsteadExpressionParser,
  returnToOwnerHandCostedEffectExpressionParser,
  revealTopConditionalExpressionParser,
  revealTopPlayRestedExpressionParser,
  searchRevealExpressionParser,
  selectedBasePowerSnapshotExpressionParser,
  syntheticInstructionSegmentParser,
  trailingConditionalExpressionSegmentParser,
} from "../segments/index.js";
import {
  selectedOpponentCharactersAttackCostExpressionParser,
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

function generalExpressionParser(input: ParseInput) {
  return parseExpression(input, {
    connectors: [parseThenConnector, parseSentenceConnector, parseAndConnector],
    segments: [
      optionalCostedEffectSegmentParser({
        instructions: instructionParsers,
        expressions: costedExpressions,
      }),
      conditionalExpressionSegmentParser({
        conditions: conditionParsers,
        connectors: [parseAndConnector],
        instructions: instructionParsers,
      }),
      delayedEndOfTurnSegmentParser({
        connectors: [parseAndConnector],
        instructions: instructionParsers,
      }),
      opponentOptionalCostSegmentParser({
        instructions: instructionParsers,
        expressions: [singleInstructionExpressionParser],
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
}

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
  chooseOneExpressionParser({
    conditions: conditionParsers,
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  }),
  lookPlayFromTopExpressionParser,
  revealTopConditionalExpressionParser({
    instructions: instructionParsers,
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  }),
  revealTopPlayRestedExpressionParser,
  searchRevealExpressionParser,
  selectedAttackRetargetExpressionParser,
  selectedOpponentCharactersAttackCostExpressionParser,
  opponentOptionalCostExpressionParser({
    instructions: instructionParsers,
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  }),
  conditionalCostedBodyExpressionParser,
  singleInstructionExpressionParser,
  generalExpressionParser,
] as const;

export const defaultRegistry = {
  metadataLines: [
    parseAnyCopiesOfThisCardRuleLine,
    parseDeckOutLossTimingRuleLine,
    parseDonDeckSizeRuleLine,
    parseNameAliasesRuleLine,
  ],
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
        revealTopConditionalExpressionParser({
          instructions: instructionParsers,
          expressions: [
            singleInstructionExpressionParser,
            generalExpressionParser,
          ],
        }),
        revealTopPlayRestedExpressionParser,
        searchRevealExpressionParser,
        opponentOptionalCostExpressionParser({
          instructions: instructionParsers,
          expressions: [
            singleInstructionExpressionParser,
            generalExpressionParser,
          ],
        }),
        singleInstructionExpressionParser,
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
    implicitEventReactionExpressionParser({
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
    applyEachContinuousExpressionParser({
      connectors: [parseAndConnector],
      instructions: continuousInstructionParsers,
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
        selectedOpponentCharactersAttackCostExpressionParser,
        singleInstructionExpressionParser,
        generalExpressionParser,
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
    selectedOpponentCharactersAttackCostExpressionParser,
    selectedBasePowerSnapshotExpressionParser,
    lookPlayFromTopExpressionParser,
    revealTopConditionalExpressionParser({
      instructions: instructionParsers,
      expressions: [singleInstructionExpressionParser, generalExpressionParser],
    }),
    revealTopPlayRestedExpressionParser,
    searchRevealExpressionParser,
    opponentOptionalCostExpressionParser({
      instructions: instructionParsers,
      expressions: [singleInstructionExpressionParser, generalExpressionParser],
    }),
    singleInstructionExpressionParser,
    generalExpressionParser,
  ],
} satisfies EffectLineParserRegistry;
