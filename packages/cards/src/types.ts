import type {
  Condition,
  Effect,
  EffectCategory,
  SequencedEffect,
  SourcePresencePolicy,
  Trigger,
} from "@optcg/types";

export type PrimitiveEvidence =
  | "entry:onPlay"
  | "entry:onKO"
  | "entry:whenAttacking"
  | "entry:lifeTrigger"
  | "entry:activateMain"
  | "entry:onBlock"
  | "entry:endOfYourTurn"
  | "entry:eventMain"
  | "entry:eventCounter"
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
  | "condition:opponentFieldCount"
  | "condition:trashCount"
  | "condition:comparator:gte"
  | "condition:threshold:positiveInteger"
  | "instruction:draw"
  | "instruction:trashFromHand"
  | "instruction:rest"
  | "instruction:preventActivation"
  | "instruction:modifyPower"
  | "instruction:giveProtection"
  | "instruction:giveKeyword"
  | "instruction:synthetic:A"
  | "instruction:synthetic:B"
  | "instructionSupport:planned"
  | "keyword:anySupported"
  | "player:self"
  | "player:opponent"
  | "chooser:self"
  | "chooser:self:upTo"
  | "target:opponentCharacters"
  | "target:thatCharacter"
  | "target:yourLeader"
  | "target:thisCharacter"
  | "reference:thatCharacter"
  | "duration:whileConditionTrue"
  | "duration:opponentNextRefreshPhase"
  | "duration:opponentNextEndPhase"
  | "modifier:positivePower"
  | "protection:opponentEffectFieldRemoval";

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
  };
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export interface ParseInput {
  readonly text: string;
}

export interface ExpressionParseResult {
  readonly effect: Effect;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
  readonly blockPatch?: {
    readonly category?: EffectCategory;
    readonly condition?: Condition;
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
  readonly sourcePresencePolicy: SourcePresencePolicy;
  readonly oncePerTurn?: true;
  readonly effect: Effect;
}

export interface ParsedEffectLine {
  readonly block: ParsedEffectBlock;
  readonly evidence: readonly PrimitiveEvidence[];
}

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
