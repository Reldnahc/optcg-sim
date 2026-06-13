import type {
  Condition,
  Effect,
  EffectCategory,
  EffectBlockCost,
  EffectTextSourceMap,
  EffectTextSpan,
  SequencedEffect,
  SourcePresencePolicy,
  Trigger,
} from "@optcg/types";
import type { SourceSlice } from "./source-slices.js";

export type PrimitiveEvidence =
  | "entry:onPlay"
  | "entry:onKO"
  | "entry:whenAttacking"
  | "entry:onOpponentAttack"
  | "entry:yourTurn"
  | "entry:lifeTrigger"
  | "entry:activateMain"
  | "entry:onBlock"
  | "entry:endOfYourTurn"
  | "entry:opponentTurn"
  | "entry:eventMain"
  | "entry:eventCounter"
  | "entry:startOfGame"
  | "entry:implicitPermanent"
  | "entry:implicitReaction"
  | "entry:activatedReaction"
  | "trigger:damageDealt"
  | "trigger:lifeRemoved"
  | "trigger:fieldRemoved"
  | "trigger:cardPlayed"
  | "event:cardPlayed"
  | "event:cardKOd"
  | "trigger:cardRested"
  | "trigger:attackDeclared"
  | "trigger:donReturned"
  | "trigger:handTrashedByEffect"
  | "trigger:opponentActivated"
  | "activation:reaction"
  | "activation:event"
  | "activation:blocker"
  | "activation:trigger"
  | "entry:replacement"
  | "entrySupport:unsupported"
  | "marker:oncePerTurn"
  | "marker:attachedDon"
  | "wrapper:onPlay"
  | "wrapper:onKO"
  | "body:draw"
  | "body:trashFromHand"
  | "count:positiveInteger"
  | "sourcePresence:mustRemain"
  | "sourcePresence:resolveFromDestination"
  | "sourcePresence:resolveFromLastKnownInformation"
  | "sourcePresence:noSourceRequired"
  | "composition:wrapperBody"
  | "composition:entryExpression"
  | "composition:entryAlternatives"
  | "composition:replacementInstead"
  | "composition:chooseOne"
  | "composition:applyEach"
  | "expression:sequence"
  | "expression:conditional"
  | "expression:conditionalContinuous"
  | "expression:replacement"
  | "expression:choice"
  | "connector:then"
  | "connector:ifPreviousSucceeded"
  | "connector:ifPreviousNotSucceeded"
  | "connector:sentence"
  | "connector:andOrdered"
  | "connector:commaBeforeLook"
  | "composition:conditionAnd"
  | "composition:conditionOr"
  | "composition:triggerAnyOf"
  | "condition:synthetic:C"
  | "condition:fieldCount"
  | "condition:leaderIdentity"
  | "condition:leaderColorCount"
  | "condition:opponentFieldCount"
  | "condition:handCount"
  | "condition:deckCount"
  | "condition:trashCount"
  | "condition:eventHistory"
  | "condition:lifeCount"
  | "condition:lifeCountDifference"
  | "condition:lifeCountTotal"
  | "condition:donFieldCount"
  | "condition:attachedDonCount"
  | "condition:cardState"
  | "condition:cardStatComparison"
  | "condition:fieldCountDifference"
  | "condition:comparator:eq"
  | "condition:comparator:lte"
  | "condition:comparator:gte"
  | "condition:threshold:positiveInteger"
  | "condition:threshold:nonNegativeInteger"
  | "condition:stat:cost"
  | "condition:stat:currentPower"
  | "instruction:draw"
  | "instruction:preventDraw"
  | "instruction:preventDonActivation"
  | "instruction:preventPlay"
  | "instruction:preventPlayByEffects"
  | "instruction:winGame"
  | "instruction:damage"
  | "instruction:preventBlockerActivation"
  | "instruction:trashFromHand"
  | "instruction:trashFromHandUntilCount"
  | "instruction:moveCards"
  | "instruction:activate"
  | "instruction:rest"
  | "instruction:returnDon"
  | "instruction:preventActivation"
  | "instruction:selectAllTargets"
  | "instruction:attackCost"
  | "instruction:changeAttackTarget"
  | "instruction:modifyPower"
  | "instruction:allowAttackActiveCharacters"
  | "instruction:invalidateEffects"
  | "instruction:setBasePower"
  | "instruction:swapBasePower"
  | "instruction:placeTopDeckCards"
  | "instruction:reorder"
  | "instruction:setState"
  | "instruction:playSelected"
  | "instruction:activateSelectedEvent"
  | "instruction:playSource"
  | "instruction:moveSelected"
  | "instruction:revealTop"
  | "instruction:selectFromSet"
  | "instruction:revealSelected"
  | "instruction:placeSetRemainder"
  | "instruction:returnToOwnerHand"
  | "instruction:trash"
  | "instruction:ko"
  | "instruction:giveProtection"
  | "instruction:giveKeyword"
  | "instruction:giveAttribute"
  | "instruction:synthetic:A"
  | "instruction:synthetic:B"
  | "instructionSupport:planned"
  | "cardinality:all"
  | "cardinality:upTo"
  | "cardinality:exact"
  | "cost:restSelf"
  | "cost:restFromField"
  | "cost:restDon"
  | "cost:attachDon"
  | "cost:returnDon"
  | "cost:turnLifeFaceUp"
  | "cost:setLifeFaceUp"
  | "cost:chooseOne"
  | "choice:option"
  | "cost:trashSelf"
  | "cost:trashFromField"
  | "cost:koFromField"
  | "cost:trashFromHand"
  | "cost:revealFromHand"
  | "cost:moveCards"
  | "cost:modifyPower"
  | "cost:returnToOwnerHand"
  | "composition:costSequence"
  | "composition:costedEffect"
  | "composition:conditionalCostedEffect"
  | "composition:optionalCostedEffect"
  | "composition:optionalActionEffect"
  | "composition:opponentOptionalCost"
  | "composition:selectThenPlay"
  | "composition:selectThenActivate"
  | "composition:selectThenApply"
  | "composition:selectThenMove"
  | "composition:savedTargetCondition"
  | "composition:forEachSavedTarget"
  | "composition:sequence"
  | "composition:delayed"
  | "look:topDeck"
  | "zone:deck"
  | "zone:hand"
  | "zone:life"
  | "zone:trash"
  | "zone:donDeck"
  | "zone:leaderArea"
  | "zone:characterArea"
  | "zone:stageArea"
  | "zone:costArea"
  | "filter:name"
  | "filter:anyOf"
  | "filter:nameNot"
  | "filter:color"
  | "filter:type"
  | "filter:attribute"
  | "filter:cost"
  | "filter:baseCost"
  | "filter:power"
  | "filter:currentPower"
  | "filter:attachedDon"
  | "filter:differentNames"
  | "filter:excludeSelf"
  | "filter:category:stage"
  | "filter:category:character"
  | "filter:category:leader"
  | "filter:category:event"
  | "filter:category:don"
  | "filter:state:active"
  | "filter:state:rested"
  | "filter:state:attached"
  | "filter:effectEntryPoint"
  | "filter:effectEntryPoint:with"
  | "filter:effectEntryPoint:without"
  | "valueSource:donFieldCount:self"
  | "valueSource:lifeCount:self"
  | "valueSource:lifeCount:opponent"
  | "valueOffset:fieldCountDifference"
  | "value:basePower:positiveInteger"
  | "value:basePower:snapshotCurrentPower"
  | "value:basePower:snapshotBasePower"
  | "value:dynamic:selectedCardCost"
  | "value:dynamic:paidCostCardCount"
  | "value:dynamic:attachedDonCount"
  | "value:dynamic:distinctFieldNames"
  | "value:dynamic:matchingZoneCards"
  | "filter:any"
  | "destination:hand"
  | "destination:ownerHand"
  | "destination:deck"
  | "destination:trash"
  | "destination:life"
  | "destination:faceUp"
  | "destination:faceDown"
  | "destination:stageArea"
  | "destination:costArea"
  | "deckRestriction:ignored"
  | "deckRestriction:eventCostGte"
  | "deckRestriction:cardCostLessThan"
  | "deckRestriction:donDeckSize"
  | "deckRestriction:anyCopiesOfThisCard"
  | "ruleModifier:deckOutLossTiming"
  | "reveal:bothPlayers"
  | "reveal:chooserOnly"
  | "visibility:private"
  | "remaining:rest"
  | "remaining:bottomDeck"
  | "remaining:trash"
  | "order:anyOrder"
  | "order:original"
  | "keyword:anySupported"
  | "player:self"
  | "player:opponent"
  | "player:any"
  | "chooser:self"
  | "count:anyNumber"
  | "chooser:self:upTo"
  | "chooser:opponent"
  | "target:yourDonCards"
  | "state:active"
  | "state:rested"
  | "position:bottom"
  | "instruction:selectTargets"
  | "instruction:selectCards"
  | "instruction:attachDon"
  | "instruction:redirectDonPhasePlacement"
  | "condition:turnCount"
  | "condition:yourTurn"
  | "condition:opponentTurn"
  | "condition:sourcePlayedThisTurn"
  | "position:top"
  | "target:thisCard"
  | "target:thisStage"
  | "target:opponentCharacters"
  | "target:opponentCharacter"
  | "target:anyCharacters"
  | "target:opponentCharactersOrDonCards"
  | "target:opponentCards"
  | "target:opponentDonCards"
  | "target:opponentLeader"
  | "target:opponentLeaderOrCharacters"
  | "target:opponentRestedCards"
  | "target:thatCharacter"
  | "target:triggerCard"
  | "target:player"
  | "target:yourLeader"
  | "target:yourNamedCards"
  | "target:yourCharacters"
  | "target:yourCards"
  | "target:yourStages"
  | "target:thisCharacter"
  | "target:thisLeader"
  | "target:selectedCharacter"
  | "reference:thatCharacter"
  | "reference:ownerOfSelected"
  | "reference:paidCost"
  | "duration:whileConditionTrue"
  | "duration:whileSourceOnField"
  | "duration:thisBattle"
  | "duration:thisTurn"
  | "duration:permanent"
  | "usageLimit:nextMatchingPlay"
  | "duration:endOfTurn"
  | "duration:opponentNextRefreshPhase"
  | "duration:opponentNextEndPhase"
  | "duration:selfNextTurnStart"
  | "phase:don"
  | "modifier:positivePower"
  | "modifier:negativePower"
  | "modifier:positiveCost"
  | "modifier:positiveCounter"
  | "modifier:costReduction"
  | "metadata:nameAliases"
  | "protectionProcess:fieldRemoval"
  | "protectionProcess:ko"
  | "protectionProcess:rest"
  | "protectionSource:opponentEffects"
  | "protectionSource:opponentCardCategoryEffects"
  | "protectionSource:opponentCardFilterEffects"
  | "protectionSource:selfEffects"
  | "protectionSource:effects"
  | "protectionSource:battle"
  | "sourceCategory:leader"
  | "sourceCategory:character"
  | "sourceCategory:event"
  | "sourceCategory:stage"
  | "replacement:wouldBeKOd"
  | "replacement:wouldMoveZone"
  | "replacement:fieldRemoval"
  | "replacementSource:opponent"
  | "replacementSource:cardEffect"
  | "condition:onlyMatchingFieldCards"
  | "instruction:activateReferencedEffect"
  | "reference:effectEntryPoint"
  | "instruction:modifyCost"
  | "instruction:modifyCounter"
  | "reference:eventMain"
  | "target:opponentStages"
  | "target:yourLeaderOrCharacters";

export interface PrimitiveNode {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface PrimitiveMetadata {
  readonly parserRuleId?: string;
  readonly shapeId?: string;
  readonly componentEvidenceId?: string;
  readonly cardId?: string;
  readonly sourceText?: string;
}

export interface PrimitiveParseResult {
  readonly node: PrimitiveNode;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest?: string;
  readonly metadata?: PrimitiveMetadata;
  readonly presentationSpans?: readonly EffectTextSpan[];
}

export interface EntryPointParseResult {
  readonly node: {
    readonly type: "entryPoint";
    readonly trigger: Trigger;
    readonly category?: EffectCategory;
    readonly condition?: Condition;
  };
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
  readonly presentationSpans?: readonly EffectTextSpan[];
}

export interface ParseInput {
  readonly text: string;
  readonly source?: SourceSlice;
  readonly entryPoint?: EntryPointParseResult["node"];
}

export interface ExpressionParseResult {
  readonly effect: Effect;
  readonly saveResultAs?: string;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
  readonly presentationSpans?: readonly EffectTextSpan[];
  readonly blockPatch?: {
    readonly category?: EffectCategory;
    readonly condition?: Condition;
    readonly cost?: EffectBlockCost;
    readonly optional?: boolean;
    readonly trigger?: Trigger;
  };
}

export interface EffectBlockPatch {
  readonly oncePerTurn?: true;
  readonly condition?: Condition;
}

export interface MarkerParseResult {
  readonly patch: EffectBlockPatch;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
  readonly presentationSpans?: readonly EffectTextSpan[];
}

export type MarkerParser = (input: ParseInput) => MarkerParseResult | undefined;

export interface ConditionParseResult {
  readonly condition: Condition;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
  readonly presentationSpans?: readonly EffectTextSpan[];
}

export interface InstructionParseResult {
  readonly effect: Effect;
  readonly saveResultAs?: string;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
  readonly presentationSpans?: readonly EffectTextSpan[];
}

export type ConditionParser = (
  input: ParseInput,
) => ConditionParseResult | undefined;

export type InstructionParser = (
  input: ParseInput,
) => InstructionParseResult | undefined;

export interface ConnectorParseResult {
  readonly segments: readonly string[];
  readonly connectors: readonly SequencedEffect["connector"][];
  readonly evidence: readonly PrimitiveEvidence[];
  readonly presentationMode?: "joined";
  readonly sourceSegments?: readonly SourceSlice[];
  readonly connectorSpans?: readonly EffectTextSpan[];
}

export interface SegmentParseResult {
  readonly effect: Effect;
  readonly saveResultAs?: string;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly presentationSpans?: readonly EffectTextSpan[];
}

export type ConnectorParser = (
  input: ParseInput,
) => ConnectorParseResult | undefined;

export type SegmentParser = (
  input: ParseInput,
) => SegmentParseResult | undefined;

export interface ParsedEffectBlock {
  readonly category: EffectCategory;
  readonly trigger: Trigger;
  readonly condition?: Condition;
  readonly cost?: EffectBlockCost;
  readonly sourcePresencePolicy: SourcePresencePolicy;
  readonly oncePerTurn?: true;
  readonly effect: Effect;
}

export interface ParsedRuntimeEffectLine {
  readonly kind?: "effect";
  readonly block: ParsedEffectBlock;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly sourceMap?: EffectTextSourceMap;
}

export interface ParsedMetadataLine {
  readonly kind: "metadata";
  readonly metadata:
    | {
        readonly type: "deckRestriction";
        readonly restriction:
          | {
              readonly type: "donDeckSize";
              readonly count: number;
            }
          | {
              readonly type: "anyCopiesOfThisCard";
            }
          | {
              readonly type: "cardCostLessThan";
              readonly cost: number;
            };
      }
    | {
        readonly type: "nameAliases";
        readonly names: readonly string[];
      }
    | {
        readonly type: "ruleModifier";
        readonly modifier: {
          readonly type: "deckOutLossTiming";
          readonly timing: "endOfTurn";
        };
      };
  readonly evidence: readonly PrimitiveEvidence[];
}

export type ParsedEffectLine = ParsedRuntimeEffectLine | ParsedMetadataLine;

export type ParseFailureStage = "entryPoint" | "expression";

export interface ParseFailureDiagnostic {
  readonly stage: ParseFailureStage;
  readonly reason: string;
  readonly text: string;
}

export type ParseCardEffectLineResult =
  | { readonly ok: true; readonly value: ParsedEffectLine }
  | { readonly ok: false; readonly diagnostic: ParseFailureDiagnostic };
