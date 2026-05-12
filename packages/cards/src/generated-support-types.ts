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
