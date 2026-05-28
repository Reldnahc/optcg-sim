import type {
  Condition,
  Effect,
  EffectCategory,
  EffectBlockCost,
  SequencedEffect,
  SourcePresencePolicy,
  Trigger,
} from "@optcg/types";

export type PrimitiveEvidence =
  | "entry:onPlay"
  | "entry:onKO"
  | "entry:whenAttacking"
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
  | "entrySupport:unsupported"
  | "marker:oncePerTurn"
  | "wrapper:onPlay"
  | "wrapper:onKO"
  | "body:draw"
  | "body:trashFromHand"
  | "count:positiveInteger"
  | "sourcePresence:mustRemain"
  | "sourcePresence:resolveFromDestination"
  | "sourcePresence:noSourceRequired"
  | "composition:wrapperBody"
  | "composition:entryExpression"
  | "expression:sequence"
  | "expression:conditional"
  | "expression:conditionalContinuous"
  | "connector:then"
  | "connector:andOrdered"
  | "condition:synthetic:C"
  | "condition:leaderIdentity"
  | "condition:opponentFieldCount"
  | "condition:handCount"
  | "condition:trashCount"
  | "condition:lifeCount"
  | "condition:donFieldCount"
  | "condition:fieldCountDifference"
  | "condition:comparator:eq"
  | "condition:comparator:lte"
  | "condition:comparator:gte"
  | "condition:threshold:positiveInteger"
  | "instruction:draw"
  | "instruction:trashFromHand"
  | "instruction:moveCards"
  | "instruction:rest"
  | "instruction:preventActivation"
  | "instruction:modifyPower"
  | "instruction:invalidateEffects"
  | "instruction:setBasePower"
  | "instruction:search"
  | "instruction:playSelected"
  | "instruction:moveSelected"
  | "instruction:trash"
  | "instruction:ko"
  | "instruction:giveProtection"
  | "instruction:giveKeyword"
  | "instruction:synthetic:A"
  | "instruction:synthetic:B"
  | "instructionSupport:planned"
  | "cardinality:all"
  | "cardinality:upTo"
  | "cardinality:exact"
  | "cost:restSelf"
  | "cost:restDon"
  | "cost:returnDon"
  | "cost:chooseOne"
  | "cost:trashFromField"
  | "cost:trashFromHand"
  | "cost:moveCards"
  | "composition:costSequence"
  | "composition:costedEffect"
  | "composition:conditionalCostedEffect"
  | "composition:optionalCostedEffect"
  | "composition:selectThenPlay"
  | "composition:selectThenApply"
  | "look:topDeck"
  | "zone:deck"
  | "zone:hand"
  | "zone:trash"
  | "zone:donDeck"
  | "zone:leaderArea"
  | "zone:characterArea"
  | "zone:costArea"
  | "filter:name"
  | "filter:anyOf"
  | "filter:nameNot"
  | "filter:color"
  | "filter:type"
  | "filter:cost"
  | "filter:power"
  | "filter:differentNames"
  | "filter:category:stage"
  | "filter:category:character"
  | "filter:category:leader"
  | "filter:category:event"
  | "filter:category:don"
  | "filter:state:rested"
  | "valueSource:donFieldCount:self"
  | "valueOffset:fieldCountDifference"
  | "value:basePower:positiveInteger"
  | "filter:any"
  | "destination:hand"
  | "destination:deck"
  | "destination:trash"
  | "destination:stageArea"
  | "destination:costArea"
  | "deckRestriction:ignored"
  | "deckRestriction:eventCostGte"
  | "deckRestriction:donDeckSize"
  | "reveal:bothPlayers"
  | "reveal:chooserOnly"
  | "remaining:rest"
  | "remaining:bottomDeck"
  | "remaining:trash"
  | "order:anyOrder"
  | "order:original"
  | "keyword:anySupported"
  | "player:self"
  | "player:opponent"
  | "chooser:self"
  | "chooser:self:upTo"
  | "chooser:opponent"
  | "target:yourDonCards"
  | "state:active"
  | "state:rested"
  | "instruction:selectCards"
  | "instruction:attachDon"
  | "condition:turnCount"
  | "condition:yourTurn"
  | "condition:opponentTurn"
  | "position:top"
  | "target:thisCard"
  | "target:opponentCharacters"
  | "target:thatCharacter"
  | "target:triggerCard"
  | "target:yourLeader"
  | "target:thisCharacter"
  | "reference:thatCharacter"
  | "duration:whileConditionTrue"
  | "duration:whileSourceOnField"
  | "duration:thisBattle"
  | "duration:thisTurn"
  | "duration:opponentNextRefreshPhase"
  | "duration:opponentNextEndPhase"
  | "modifier:positivePower"
  | "modifier:negativePower"
  | "modifier:costReduction"
  | "protectionProcess:fieldRemoval"
  | "protectionProcess:ko"
  | "protectionSource:opponentEffects"
  | "protectionSource:effects"
  | "protectionSource:battle"
  | "condition:onlyMatchingFieldCards"
  | "instruction:activateReferencedEffect"
  | "instruction:modifyCost"
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
}

export interface ParseInput {
  readonly text: string;
  readonly entryPoint?: EntryPointParseResult["node"];
}

export interface ExpressionParseResult {
  readonly effect: Effect;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
  readonly blockPatch?: {
    readonly category?: EffectCategory;
    readonly condition?: Condition;
    readonly cost?: EffectBlockCost;
  };
}

export interface EffectBlockPatch {
  readonly oncePerTurn?: true;
}

export interface MarkerParseResult {
  readonly patch: EffectBlockPatch;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export type MarkerParser = (input: ParseInput) => MarkerParseResult | undefined;

export interface ConditionParseResult {
  readonly condition: Condition;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export interface InstructionParseResult {
  readonly effect: Effect;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
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
}

export interface SegmentParseResult {
  readonly effect: Effect;
  readonly evidence: readonly PrimitiveEvidence[];
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
}

export interface ParsedMetadataLine {
  readonly kind: "metadata";
  readonly metadata: {
    readonly type: "deckRestriction";
    readonly restriction: {
      readonly type: "donDeckSize";
      readonly count: number;
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

export interface PrimitiveSupportResult {
  readonly supported: boolean;
  readonly missingEvidence: readonly PrimitiveEvidence[];
}
