import type { CardId, EffectDefinition } from "@optcg/types";

export const generatedSupportParserResultStatuses = [
  "complete",
  "partial",
  "unsupportedPrimitive",
  "ambiguousWording",
  "staleHash",
  "customHandlerRequired",
] as const;

export type GeneratedSupportParserResultStatus =
  (typeof generatedSupportParserResultStatuses)[number];

export type GeneratedSupportBlockerCode =
  | "missing-runtime-capability"
  | "unparsed-span"
  | "unsupported-primitive"
  | "ambiguous-wording"
  | "stale-hash"
  | "custom-handler-required"
  | "invalid-dsl-schema";

export const generatedSupportDiagnosticLayers = [
  "parser",
  "schema",
  "runtime-capability",
  "source-integrity",
  "metadata",
  "review",
  "test-status",
  "stale-hash",
  "unsupported-primitive",
  "unsupported-trigger",
  "unsupported-cost",
  "unsupported-optionality",
  "unsupported-condition",
  "unsupported-cardinality",
  "unsupported-target",
  "unsupported-duration",
  "unsupported-modifier",
  "unsupported-restriction",
  "unsupported-saved-reference",
  "unsupported-layer",
] as const;

export type GeneratedSupportDiagnosticLayer =
  (typeof generatedSupportDiagnosticLayers)[number];

export interface GeneratedSupportUnparsedSpan {
  start: number;
  end: number;
  text: string;
}

export interface GeneratedSupportBlocker {
  code: GeneratedSupportBlockerCode;
  message: string;
  capabilityId?: string;
  component?: string;
  diagnosticLayer?: GeneratedSupportDiagnosticLayer;
  expectedHash?: string;
  parserRuleId?: string;
  receivedHash?: string;
  span?: GeneratedSupportUnparsedSpan;
}

interface GeneratedSupportParserResultBase {
  cardId: CardId;
  sourceText: string;
  sourceTextHash: string;
}

export interface CompleteGeneratedSupportParseResult extends GeneratedSupportParserResultBase {
  status: "complete";
  effectDefinition: EffectDefinition;
  parserRuleIds: readonly string[];
}

export interface PartialGeneratedSupportParseResult extends GeneratedSupportParserResultBase {
  status: "partial";
  blockers: readonly GeneratedSupportBlocker[];
  parsedRuleIds: readonly string[];
  unparsedSpans: readonly GeneratedSupportUnparsedSpan[];
}

export interface UnsupportedPrimitiveGeneratedSupportParseResult extends GeneratedSupportParserResultBase {
  status: "unsupportedPrimitive";
  blockers: readonly GeneratedSupportBlocker[];
}

export interface AmbiguousWordingGeneratedSupportParseResult extends GeneratedSupportParserResultBase {
  status: "ambiguousWording";
  blockers: readonly GeneratedSupportBlocker[];
}

export interface StaleHashGeneratedSupportParseResult extends GeneratedSupportParserResultBase {
  status: "staleHash";
  blockers: readonly GeneratedSupportBlocker[];
}

export interface CustomHandlerRequiredGeneratedSupportParseResult extends GeneratedSupportParserResultBase {
  status: "customHandlerRequired";
  blockers: readonly GeneratedSupportBlocker[];
}

export type GeneratedSupportParserResult =
  | CompleteGeneratedSupportParseResult
  | PartialGeneratedSupportParseResult
  | UnsupportedPrimitiveGeneratedSupportParseResult
  | AmbiguousWordingGeneratedSupportParseResult
  | StaleHashGeneratedSupportParseResult
  | CustomHandlerRequiredGeneratedSupportParseResult;

export function isCompleteGeneratedSupportParseResult(
  result: GeneratedSupportParserResult,
): result is CompleteGeneratedSupportParseResult {
  return result.status === "complete";
}
