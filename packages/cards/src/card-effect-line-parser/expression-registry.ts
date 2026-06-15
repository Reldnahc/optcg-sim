import {
  parseAndConnector,
  parseCommaBeforeLookConnector,
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
  parseStartOfTurnEntryPoint,
  parseSupportedEntryPoint,
  parseTurnWindowedEntryPoint,
} from "../entry-points/index.js";
import {
  parseAttachedDonMarker,
  parseOncePerTurnMarker,
} from "../markers/index.js";
import {
  parseAnyCopiesOfThisCardRuleLine,
  parseCardCostRestrictionRuleLine,
  parseDeckOutLossTimingRuleLine,
  parseDonDeckSizeRuleLine,
  parseNameAliasesRuleLine,
} from "../metadata-lines/index.js";
import type { EffectLineParserRegistry } from "../orchestrator.js";
import {
  applyEachContinuousExpressionParser,
  basePowerSwapExpressionParser,
  chosenCostRevealExpressionParser,
  chooseOneExpressionParser,
  activatedReactionExpressionParser,
  conditionalSelectedPowerContinuationExpressionParser,
  conditionalAdditionalSelectedPowerContinuationExpressionParser,
  conditionalAlternateSelectionExpressionParser,
  conditionalBlockExpressionParser,
  conditionalContinuousExpressionParser,
  conditionalCostedBlockExpressionParser,
  conditionalExpressionSegmentParser,
  costedEffectExpressionParser,
  delayedEndOfTurnSegmentParser,
  entryConditionContinuousExpressionParser,
  eventTimedDelayedSegmentParser,
  implicitEventReactionExpressionParser,
  instructionExpressionSegmentParser,
  lookPlayFromTopExpressionParser,
  opponentOptionalCostExpressionParser,
  opponentOptionalCostSegmentParser,
  optionalActionEffectSegmentParser,
  optionalCostedEffectExpressionParser,
  optionalCostedEffectSegmentParser,
  playStageFromDeckExpressionParser,
  playedObjectDelayedDeckBottomExpressionParser,
  playedObjectKeywordGrantExpressionParser,
  replacementInsteadExpressionParser,
  returnToOwnerHandCostedEffectExpressionParser,
  revealedHandPlayExpressionParser,
  revealTopConditionalExpressionParser,
  revealTopPlayRestedExpressionParser,
  searchRevealExpressionParser,
  selectedBasePowerSnapshotExpressionParser,
  selectedPowerContinuationExpressionParser,
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
  const eventTimedDelayed = eventTimedDelayedSegmentParser({
    connectors: [parseThenConnector, parseSentenceConnector, parseAndConnector],
    instructions: instructionParsers,
  })(input);
  if (eventTimedDelayed !== undefined) {
    return {
      effect: eventTimedDelayed.effect,
      evidence: eventTimedDelayed.evidence,
      rest: "",
      ...(eventTimedDelayed.presentationSpans === undefined
        ? {}
        : { presentationSpans: eventTimedDelayed.presentationSpans }),
    };
  }

  return parseExpression(input, {
    connectors: [
      parseCommaBeforeLookConnector,
      parseThenConnector,
      parseSentenceConnector,
      parseAndConnector,
    ],
    segments: [
      optionalCostedEffectSegmentParser({
        instructions: instructionParsers,
        expressions: costedExpressions,
      }),
      eventTimedDelayedSegmentParser({
        connectors: [
          parseThenConnector,
          parseSentenceConnector,
          parseAndConnector,
        ],
        instructions: instructionParsers,
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
      optionalActionEffectSegmentParser({
        instructions: instructionParsers,
        expressions: [singleInstructionExpressionParser],
      }),
      trailingConditionalExpressionSegmentParser({
        conditions: conditionParsers,
        connectors: [parseAndConnector],
        instructions: instructionParsers,
      }),
      (segmentInput) => {
        const parsed = searchRevealExpressionParser(segmentInput);
        if (parsed === undefined) {
          return undefined;
        }
        return {
          effect: parsed.effect,
          evidence: parsed.evidence,
          ...(parsed.presentationSpans === undefined
            ? {}
            : { presentationSpans: parsed.presentationSpans }),
        };
      },
      instructionExpressionSegmentParser({
        connectors: [parseAndConnector],
        instructions: instructionParsers,
      }),
      syntheticInstructionSegmentParser(instructionParsers),
    ],
  });
}

const conditionalCostedBodyExpressionParser = (input: ParseInput) => {
  const conditionalSearch = conditionalExpressionSegmentParser({
    conditions: conditionParsers,
    connectors: [parseThenConnector, parseAndConnector],
    instructions: [],
    expressions: [searchRevealExpressionParser],
  })(input);
  if (conditionalSearch !== undefined) {
    return {
      effect: conditionalSearch.effect,
      evidence: conditionalSearch.evidence,
      rest: "",
      ...(conditionalSearch.presentationSpans === undefined
        ? {}
        : { presentationSpans: conditionalSearch.presentationSpans }),
    };
  }
  if (/\.\s+Then,\s+/u.test(input.text)) {
    return undefined;
  }
  const parsed = conditionalExpressionSegmentParser({
    conditions: conditionParsers,
    connectors: [parseThenConnector, parseAndConnector],
    instructions: instructionParsers,
    expressions: [
      searchRevealExpressionParser,
      singleInstructionExpressionParser,
    ],
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
  conditionalAlternateSelectionExpressionParser({
    conditions: conditionParsers,
    instructions: instructionParsers,
  }),
  chooseOneExpressionParser({
    conditions: conditionParsers,
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  }),
  lookPlayFromTopExpressionParser,
  revealTopConditionalExpressionParser({
    instructions: instructionParsers,
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  }),
  chosenCostRevealExpressionParser({
    instructions: instructionParsers,
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  }),
  revealedHandPlayExpressionParser,
  revealTopPlayRestedExpressionParser,
  searchRevealExpressionParser,
  selectedAttackRetargetExpressionParser,
  selectedOpponentCharactersAttackCostExpressionParser,
  conditionalSelectedPowerContinuationExpressionParser({
    conditions: conditionParsers,
  }),
  conditionalAdditionalSelectedPowerContinuationExpressionParser({
    conditions: conditionParsers,
  }),
  selectedPowerContinuationExpressionParser,
  basePowerSwapExpressionParser,
  playedObjectKeywordGrantExpressionParser({
    instructions: instructionParsers,
    expressions: [singleInstructionExpressionParser],
  }),
  playedObjectDelayedDeckBottomExpressionParser({
    instructions: instructionParsers,
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  }),
  opponentOptionalCostExpressionParser({
    instructions: instructionParsers,
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  }),
  implicitEventReactionExpressionParser({
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  }),
  conditionalCostedBodyExpressionParser,
  singleInstructionExpressionParser,
  generalExpressionParser,
] as const;

export const defaultRegistry = {
  metadataLines: [
    parseAnyCopiesOfThisCardRuleLine,
    parseCardCostRestrictionRuleLine,
    parseDeckOutLossTimingRuleLine,
    parseDonDeckSizeRuleLine,
    parseNameAliasesRuleLine,
  ],
  entryPoints: [
    parseRulesStartOfGameEntryPoint,
    parseTurnWindowedEntryPoint,
    parseStartOfTurnEntryPoint,
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
        chosenCostRevealExpressionParser({
          instructions: instructionParsers,
          expressions: [
            singleInstructionExpressionParser,
            generalExpressionParser,
          ],
        }),
        revealedHandPlayExpressionParser,
        revealTopPlayRestedExpressionParser,
        searchRevealExpressionParser,
        playedObjectKeywordGrantExpressionParser({
          instructions: instructionParsers,
          expressions: [singleInstructionExpressionParser],
        }),
        playedObjectDelayedDeckBottomExpressionParser({
          instructions: instructionParsers,
          expressions: [
            singleInstructionExpressionParser,
            generalExpressionParser,
          ],
        }),
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
    implicitEventReactionExpressionParser({
      expressions: [
        lookPlayFromTopExpressionParser,
        conditionalBlockExpressionParser({
          conditions: conditionParsers,
          connectors: [parseThenConnector, parseAndConnector],
          instructions: instructionParsers,
        }),
        optionalCostedEffectExpressionParser({
          instructions: instructionParsers,
          expressions: costedExpressions,
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
        revealTopConditionalExpressionParser({
          instructions: instructionParsers,
          expressions: [
            singleInstructionExpressionParser,
            generalExpressionParser,
          ],
        }),
        chosenCostRevealExpressionParser({
          instructions: instructionParsers,
          expressions: [
            singleInstructionExpressionParser,
            generalExpressionParser,
          ],
        }),
        revealedHandPlayExpressionParser,
        searchRevealExpressionParser,
        playedObjectKeywordGrantExpressionParser({
          instructions: instructionParsers,
          expressions: [singleInstructionExpressionParser],
        }),
        playedObjectDelayedDeckBottomExpressionParser({
          instructions: instructionParsers,
          expressions: [
            singleInstructionExpressionParser,
            generalExpressionParser,
          ],
        }),
        selectedOpponentCharactersAttackCostExpressionParser,
        conditionalAdditionalSelectedPowerContinuationExpressionParser({
          conditions: conditionParsers,
        }),
        selectedPowerContinuationExpressionParser,
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
    conditionalAlternateSelectionExpressionParser({
      conditions: conditionParsers,
      instructions: instructionParsers,
    }),
    selectedOpponentCharactersAttackCostExpressionParser,
    selectedBasePowerSnapshotExpressionParser,
    conditionalAdditionalSelectedPowerContinuationExpressionParser({
      conditions: conditionParsers,
    }),
    selectedPowerContinuationExpressionParser,
    basePowerSwapExpressionParser,
    lookPlayFromTopExpressionParser,
    revealTopConditionalExpressionParser({
      instructions: instructionParsers,
      expressions: [singleInstructionExpressionParser, generalExpressionParser],
    }),
    chosenCostRevealExpressionParser({
      instructions: instructionParsers,
      expressions: [singleInstructionExpressionParser, generalExpressionParser],
    }),
    revealedHandPlayExpressionParser,
    revealTopPlayRestedExpressionParser,
    searchRevealExpressionParser,
    playedObjectKeywordGrantExpressionParser({
      instructions: instructionParsers,
      expressions: [singleInstructionExpressionParser],
    }),
    playedObjectDelayedDeckBottomExpressionParser({
      instructions: instructionParsers,
      expressions: [singleInstructionExpressionParser, generalExpressionParser],
    }),
    opponentOptionalCostExpressionParser({
      instructions: instructionParsers,
      expressions: [singleInstructionExpressionParser, generalExpressionParser],
    }),
    singleInstructionExpressionParser,
    generalExpressionParser,
  ],
} satisfies EffectLineParserRegistry;
