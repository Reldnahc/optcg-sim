import {
  parseAndConnector,
  parseCommaBeforeLookConnector,
  parseMixedSequenceConnector,
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
  parseDeckOutWinRuleLine,
  parseDonDeckSizeRuleLine,
  parseNameAliasesRuleLine,
  parseSpecialRulesLine,
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
  delayedEndOfBattleSegmentParser,
  costedEffectExpressionParser,
  deckRevealToHandExpressionParser,
  delayedEndOfTurnSegmentParser,
  delayedStartOfNextMainPhaseSegmentParser,
  drawForEachFieldTrashSameExpressionParser,
  entryConditionContinuousExpressionParser,
  eventTimedDelayedSegmentParser,
  implicitEventReactionExpressionParser,
  instructionExpressionSegmentParser,
  koCountPowerContinuationExpressionParser,
  lookPlayFromTopExpressionParser,
  lookTrashFromTopExpressionParser,
  opponentHandRevealExpressionParser,
  opponentOptionalCostExpressionParser,
  opponentOptionalCostSegmentParser,
  optionalActionEffectSegmentParser,
  optionalCostedEffectExpressionParser,
  optionalCostedEffectSegmentParser,
  optionalPlayCostedEffectExpressionParser,
  optionalPlayCostedEffectSegmentParser,
  paidCostSelectionMovementExpressionParser,
  playFromDeckExpressionParser,
  playStageFromDeckExpressionParser,
  playedObjectDelayedDeckBottomExpressionParser,
  playedObjectKeywordGrantExpressionParser,
  replacementInsteadExpressionParser,
  returnToOwnerHandPaidCountPowerExpressionParser,
  returnToOwnerHandCostedEffectExpressionParser,
  revealedHandPlayExpressionParser,
  revealTopAddToHandExpressionParser,
  revealTopConditionalExpressionParser,
  revealTopPlayExpressionParser,
  revealTopPlayRestedExpressionParser,
  sameNumberHandTrashDeckTrashSegmentParser,
  searchRevealExpressionParser,
  selectedAttackRestrictionExpressionParser,
  selectedBasePowerSnapshotExpressionParser,
  selectedProtectionContinuationExpressionParser,
  selectedPowerContinuationExpressionParser,
  selectedRefreshLockExpressionParser,
  syntheticInstructionSegmentParser,
  trailingImplicitEventReactionExpressionParser,
  trailingConditionalExpressionSegmentParser,
  trashTopDeckConditionalExpressionParser,
} from "../segments/index.js";
import {
  selectedOpponentCharactersAttackCostExpressionParser,
  selectedAttackRetargetExpressionParser,
  selectThenPreventBlockerActivationExpressionParser,
  selectPowerThenPreventBlockerActivationExpressionParser,
} from "../instructions/index.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";
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

const optionalActionExpressionParser = (
  input: ParseInput,
): ExpressionParseResult | undefined => {
  const parsed = optionalActionEffectSegmentParser({
    instructions: instructionParsers,
    expressions: [singleInstructionExpressionParser],
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

const basicBodyExpressions = () =>
  [singleInstructionExpressionParser, generalExpressionParser] as const;

const singleInstructionBodyExpressions = () =>
  [singleInstructionExpressionParser] as const;

const paidCostAwareExpressionParser = (
  input: ParseInput,
): ExpressionParseResult | undefined => {
  if (
    !/\bplace the (?:revealed|selected) cards? at the (?:top|bottom) of your deck\b/iu.test(
      input.text,
    )
  ) {
    return undefined;
  }

  return parseExpression(input, {
    connectors: [parseThenConnector, parseSentenceConnector, parseAndConnector],
    segments: [
      (segmentInput) => {
        const parsed = singleInstructionExpressionParser(segmentInput);
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
      (segmentInput) => {
        const parsed = paidCostSelectionMovementExpressionParser(segmentInput);
        if (parsed === undefined) {
          return undefined;
        }
        return {
          effect: parsed.effect,
          evidence: parsed.evidence,
        };
      },
    ],
  });
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

  const trailingReaction = trailingImplicitEventReactionExpressionParser({
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  })(input);
  if (trailingReaction !== undefined) {
    return trailingReaction;
  }

  const returnPaidCountPower = returnToOwnerHandPaidCountPowerExpressionParser({
    instructions: instructionParsers,
  })(input);
  if (returnPaidCountPower !== undefined) {
    return returnPaidCountPower;
  }

  return parseExpression(input, {
    connectors: [
      parseCommaBeforeLookConnector,
      parseThenConnector,
      parseSentenceConnector,
      parseAndConnector,
      parseMixedSequenceConnector,
    ],
    segments: [
      optionalCostedEffectSegmentParser({
        instructions: instructionParsers,
        expressions: costedExpressions,
      }),
      optionalPlayCostedEffectSegmentParser({
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
        expressions: [optionalActionExpressionParser],
      }),
      delayedEndOfBattleSegmentParser({
        connectors: [parseAndConnector],
        instructions: instructionParsers,
      }),
      delayedEndOfTurnSegmentParser({
        connectors: [parseAndConnector],
        instructions: instructionParsers,
      }),
      delayedStartOfNextMainPhaseSegmentParser({
        connectors: [parseAndConnector],
        instructions: instructionParsers,
      }),
      opponentOptionalCostSegmentParser({
        instructions: instructionParsers,
        expressions: [singleInstructionExpressionParser],
      }),
      (segmentInput) => {
        const parsed = opponentHandRevealExpressionParser({
          instructions: instructionParsers,
          expressions: [
            singleInstructionExpressionParser,
            generalExpressionParser,
          ],
        })(segmentInput);
        if (parsed === undefined) {
          return undefined;
        }
        return {
          effect: parsed.effect,
          evidence: parsed.evidence,
        };
      },
      (segmentInput) => {
        const parsed = drawForEachFieldTrashSameExpressionParser(segmentInput);
        if (parsed === undefined) {
          return undefined;
        }
        return {
          effect: parsed.effect,
          evidence: parsed.evidence,
        };
      },
      optionalActionEffectSegmentParser({
        instructions: instructionParsers,
        expressions: [singleInstructionExpressionParser],
      }),
      trailingConditionalExpressionSegmentParser({
        conditions: conditionParsers,
        connectors: [parseAndConnector],
        instructions: instructionParsers,
        expressions: [optionalActionExpressionParser],
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
      (segmentInput) => {
        const parsed =
          revealTopAddToHandExpressionParser(segmentInput) ??
          deckRevealToHandExpressionParser(segmentInput) ??
          revealTopPlayExpressionParser(segmentInput);
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
      (segmentInput) => {
        const parsed =
          conditionalAdditionalSelectedPowerContinuationExpressionParser({
            conditions: conditionParsers,
          })(segmentInput) ??
          selectedPowerContinuationExpressionParser(segmentInput);
        if (parsed === undefined) {
          return undefined;
        }
        return {
          effect: parsed.effect,
          evidence: parsed.evidence,
        };
      },
      (segmentInput) => {
        const parsed = selectedAttackRestrictionExpressionParser(segmentInput);
        if (parsed === undefined) {
          return undefined;
        }
        return {
          effect: parsed.effect,
          evidence: parsed.evidence,
        };
      },
      (segmentInput) => {
        const parsed =
          selectedProtectionContinuationExpressionParser(segmentInput);
        if (parsed === undefined) {
          return undefined;
        }
        return {
          effect: parsed.effect,
          evidence: parsed.evidence,
        };
      },
      sameNumberHandTrashDeckTrashSegmentParser,
      syntheticInstructionSegmentParser(instructionParsers),
    ],
  });
}

const conditionalCostedBodyExpressionParser = (input: ParseInput) => {
  const conditionalSearch = conditionalExpressionSegmentParser({
    conditions: conditionParsers,
    connectors: [parseThenConnector, parseAndConnector],
    instructions: [],
    expressions: [
      searchRevealExpressionParser,
      lookPlayFromTopExpressionParser,
      lookTrashFromTopExpressionParser,
    ],
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
      selectedAttackRestrictionExpressionParser,
      selectedAttackRetargetExpressionParser,
      selectedRefreshLockExpressionParser,
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
  lookTrashFromTopExpressionParser,
  playFromDeckExpressionParser,
  deckRevealToHandExpressionParser,
  revealTopAddToHandExpressionParser,
  revealTopPlayExpressionParser,
  revealTopConditionalExpressionParser({
    instructions: instructionParsers,
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  }),
  trashTopDeckConditionalExpressionParser({
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
  selectedRefreshLockExpressionParser,
  selectedProtectionContinuationExpressionParser,
  koCountPowerContinuationExpressionParser,
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
  opponentHandRevealExpressionParser({
    instructions: instructionParsers,
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  }),
  paidCostSelectionMovementExpressionParser,
  paidCostAwareExpressionParser,
  drawForEachFieldTrashSameExpressionParser,
  implicitEventReactionExpressionParser({
    expressions: [singleInstructionExpressionParser, generalExpressionParser],
  }),
  conditionalCostedBodyExpressionParser,
  singleInstructionExpressionParser,
  generalExpressionParser,
] as const;

const conditionalCostedBlockExpressions = () =>
  [
    returnToOwnerHandCostedEffectExpressionParser({
      conditions: conditionParsers,
      instructions: instructionParsers,
      expressions: costedExpressions,
    }),
    returnToOwnerHandPaidCountPowerExpressionParser({
      instructions: instructionParsers,
    }),
    optionalCostedEffectExpressionParser({
      instructions: instructionParsers,
      expressions: costedExpressions,
    }),
    optionalPlayCostedEffectExpressionParser({
      instructions: instructionParsers,
      expressions: costedExpressions,
    }),
  ] as const;

const topLevelChooseOneExpressions = () =>
  [
    lookPlayFromTopExpressionParser,
    lookTrashFromTopExpressionParser,
    playFromDeckExpressionParser,
    deckRevealToHandExpressionParser,
    revealTopAddToHandExpressionParser,
    revealTopPlayExpressionParser,
    revealTopConditionalExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    trashTopDeckConditionalExpressionParser({
      expressions: basicBodyExpressions(),
    }),
    chosenCostRevealExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    revealedHandPlayExpressionParser,
    revealTopPlayRestedExpressionParser,
    searchRevealExpressionParser,
    playedObjectKeywordGrantExpressionParser({
      instructions: instructionParsers,
      expressions: singleInstructionBodyExpressions(),
    }),
    playedObjectDelayedDeckBottomExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    opponentOptionalCostExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    opponentHandRevealExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    drawForEachFieldTrashSameExpressionParser,
    singleInstructionExpressionParser,
    generalExpressionParser,
  ] as const;

const activatedReactionBodyExpressions = () =>
  [...conditionalCostedBlockExpressions(), generalExpressionParser] as const;

const implicitEventReactionBodyExpressions = () =>
  [
    lookPlayFromTopExpressionParser,
    lookTrashFromTopExpressionParser,
    playFromDeckExpressionParser,
    deckRevealToHandExpressionParser,
    revealTopAddToHandExpressionParser,
    revealTopPlayExpressionParser,
    conditionalBlockExpressionParser({
      conditions: conditionParsers,
      connectors: [parseThenConnector, parseAndConnector],
      instructions: instructionParsers,
    }),
    optionalCostedEffectExpressionParser({
      instructions: instructionParsers,
      expressions: costedExpressions,
    }),
    optionalPlayCostedEffectExpressionParser({
      instructions: instructionParsers,
      expressions: costedExpressions,
    }),
    singleInstructionExpressionParser,
    generalExpressionParser,
  ] as const;

const conditionalBlockBodyExpressions = () =>
  [
    conditionalAlternateSelectionExpressionParser({
      conditions: conditionParsers,
      instructions: instructionParsers,
    }),
    lookPlayFromTopExpressionParser,
    lookTrashFromTopExpressionParser,
    playFromDeckExpressionParser,
    deckRevealToHandExpressionParser,
    revealTopAddToHandExpressionParser,
    revealTopPlayExpressionParser,
    revealTopConditionalExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    trashTopDeckConditionalExpressionParser({
      expressions: basicBodyExpressions(),
    }),
    chosenCostRevealExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    revealedHandPlayExpressionParser,
    searchRevealExpressionParser,
    playedObjectKeywordGrantExpressionParser({
      instructions: instructionParsers,
      expressions: singleInstructionBodyExpressions(),
    }),
    playedObjectDelayedDeckBottomExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    selectedOpponentCharactersAttackCostExpressionParser,
    selectedAttackRetargetExpressionParser,
    selectedRefreshLockExpressionParser,
    selectedProtectionContinuationExpressionParser,
    koCountPowerContinuationExpressionParser,
    conditionalAdditionalSelectedPowerContinuationExpressionParser({
      conditions: conditionParsers,
    }),
    selectedPowerContinuationExpressionParser,
    singleInstructionExpressionParser,
    generalExpressionParser,
  ] as const;

const rootExpressionParsers = () =>
  [
    chooseOneExpressionParser({
      conditions: conditionParsers,
      expressions: topLevelChooseOneExpressions(),
    }),
    conditionalCostedBlockExpressionParser({
      conditions: conditionParsers,
      expressions: conditionalCostedBlockExpressions(),
    }),
    returnToOwnerHandCostedEffectExpressionParser({
      conditions: conditionParsers,
      instructions: instructionParsers,
      expressions: costedExpressions,
    }),
    returnToOwnerHandPaidCountPowerExpressionParser({
      instructions: instructionParsers,
    }),
    replacementInsteadExpressionParser,
    activatedReactionExpressionParser({
      expressions: activatedReactionBodyExpressions(),
    }),
    implicitEventReactionExpressionParser({
      expressions: implicitEventReactionBodyExpressions(),
    }),
    applyEachContinuousExpressionParser({
      conditions: conditionParsers,
      connectors: [parseAndConnector],
      instructions: continuousInstructionParsers,
    }),
    conditionalContinuousExpressionParser({
      conditions: conditionParsers,
      connectors: [parseSentenceConnector, parseAndConnector],
      instructions: continuousInstructionParsers,
    }),
    entryConditionContinuousExpressionParser({
      conditions: conditionParsers,
      connectors: [parseSentenceConnector, parseAndConnector],
      instructions: continuousInstructionParsers,
    }),
    conditionalBlockExpressionParser({
      conditions: conditionParsers,
      connectors: [parseThenConnector, parseAndConnector],
      instructions: instructionParsers,
      expressions: conditionalBlockBodyExpressions(),
    }),
    costedEffectExpressionParser({
      instructions: instructionParsers,
      expressions: costedExpressions,
    }),
    optionalCostedEffectExpressionParser({
      instructions: instructionParsers,
      expressions: costedExpressions,
    }),
    optionalPlayCostedEffectExpressionParser({
      instructions: instructionParsers,
      expressions: costedExpressions,
    }),
    playFromDeckExpressionParser,
    playStageFromDeckExpressionParser,
    deckRevealToHandExpressionParser,
    selectThenPreventBlockerActivationExpressionParser,
    selectPowerThenPreventBlockerActivationExpressionParser,
    selectedAttackRetargetExpressionParser,
    conditionalAlternateSelectionExpressionParser({
      conditions: conditionParsers,
      instructions: instructionParsers,
    }),
    selectedOpponentCharactersAttackCostExpressionParser,
    selectedRefreshLockExpressionParser,
    selectedProtectionContinuationExpressionParser,
    selectedBasePowerSnapshotExpressionParser,
    koCountPowerContinuationExpressionParser,
    conditionalAdditionalSelectedPowerContinuationExpressionParser({
      conditions: conditionParsers,
    }),
    selectedPowerContinuationExpressionParser,
    basePowerSwapExpressionParser,
    lookPlayFromTopExpressionParser,
    lookTrashFromTopExpressionParser,
    playFromDeckExpressionParser,
    deckRevealToHandExpressionParser,
    revealTopAddToHandExpressionParser,
    revealTopPlayExpressionParser,
    revealTopConditionalExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    trashTopDeckConditionalExpressionParser({
      expressions: basicBodyExpressions(),
    }),
    chosenCostRevealExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    revealedHandPlayExpressionParser,
    revealTopPlayRestedExpressionParser,
    searchRevealExpressionParser,
    playedObjectKeywordGrantExpressionParser({
      instructions: instructionParsers,
      expressions: singleInstructionBodyExpressions(),
    }),
    playedObjectDelayedDeckBottomExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    opponentOptionalCostExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    opponentHandRevealExpressionParser({
      instructions: instructionParsers,
      expressions: basicBodyExpressions(),
    }),
    drawForEachFieldTrashSameExpressionParser,
    singleInstructionExpressionParser,
    generalExpressionParser,
  ] as const;

export const defaultRegistry = {
  metadataLines: [
    parseAnyCopiesOfThisCardRuleLine,
    parseCardCostRestrictionRuleLine,
    parseDeckOutLossTimingRuleLine,
    parseDeckOutWinRuleLine,
    parseDonDeckSizeRuleLine,
    parseNameAliasesRuleLine,
    parseSpecialRulesLine,
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
  expressions: rootExpressionParsers(),
} satisfies EffectLineParserRegistry;
