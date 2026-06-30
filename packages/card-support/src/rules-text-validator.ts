import { evaluateEffectBlockRuntimeSupport } from "@optcg/engine-core";
import type { ParserSupportCertificate, RuntimeSupportReport } from "@optcg/types";
import {
  createParserSupportCertificate,
  gameplayLinesFromTextParts,
  parseCardEffectLinesDetailed,
  parseRawKeywordLine,
  type ParsedEffectLine,
  type ParsedRuntimeEffectLine,
} from "@optcg/cards";

import {
  runtimeBlocksForValues,
  runtimeContextForEffectLines,
  type SupportProbeRuntimeContext,
} from "./support-probe-runtime-context.js";

export interface RulesTextValidationInput {
  readonly effect?: string | null;
  readonly trigger?: string | null;
}

export interface RulesTextValidationLine {
  readonly field: "effect" | "trigger";
  readonly lineNumber: number;
  readonly text: string;
  readonly parseOk: boolean;
  readonly runtimeSupported: boolean;
  readonly stage?: string;
  readonly reason?: string;
}

export interface RulesTextValidationResult {
  readonly supported: boolean;
  readonly lines: readonly RulesTextValidationLine[];
}

export type RulesTextLineEvaluation =
  | {
      readonly kind: "effect";
      readonly parseOk: true;
      readonly values: readonly Extract<
        ParsedEffectLine,
        { readonly block: unknown }
      >[];
      readonly runtimeSupported: boolean;
      readonly runtimeReason?: string;
      readonly parserCertificate: ParserSupportCertificate;
      readonly runtimeReports: readonly RuntimeSupportReport[];
    }
  | {
      readonly kind: "metadata";
      readonly parseOk: true;
      readonly value: Extract<ParsedEffectLine, { readonly kind: "metadata" }>;
      readonly runtimeSupported: true;
    }
  | {
      readonly kind: "rawKeyword";
      readonly parseOk: true;
      readonly keyword: string;
      readonly runtimeSupported: true;
    }
  | {
      readonly parseOk: false;
      readonly stage: string;
      readonly reason: string;
      readonly text: string;
    };

export type RulesTextEffectLineEvaluation = Extract<
  RulesTextLineEvaluation,
  { readonly parseOk: true; readonly kind: "effect" }
>;

interface CollectedRulesTextLine {
  readonly field: "effect" | "trigger";
  readonly lineNumber: number;
  readonly text: string;
}

export function validateRulesText(
  input: RulesTextValidationInput,
): RulesTextValidationResult {
  const collectedLines = collectRulesTextLines(input);
  const runtimeContext = runtimeContextForEffectLines(
    collectedLines.map((line) => line.text),
    (lineNumber) => `line:${String(lineNumber)}`,
  );
  const lines = collectedLines.map((line, index) =>
    toValidationLine(
      line,
      evaluateRulesTextLine(
        line.text,
        `line:${String(index + 1)}`,
        runtimeContext,
      ),
    ),
  );

  return {
    supported: lines.every(
      (line) => line.parseOk && line.runtimeSupported,
    ),
    lines,
  };
}

export const evaluateRulesTextLine = (
  text: string,
  effectId: string,
  runtimeContext?: SupportProbeRuntimeContext,
): RulesTextLineEvaluation => {
  const rawKeyword = parseRawKeywordLine({ text });
  if (rawKeyword !== undefined) {
    return {
      kind: "rawKeyword",
      parseOk: true,
      keyword: rawKeyword.keyword,
      runtimeSupported: true,
    };
  }

  const parsed = parseCardEffectLinesDetailed(text);
  if (!parsed.ok) {
    return {
      parseOk: false,
      stage: parsed.diagnostic.stage,
      reason: parsed.diagnostic.reason,
      text: parsed.diagnostic.text,
    };
  }
  const metadata = parsed.value.find(
    (
      value,
    ): value is Extract<ParsedEffectLine, { readonly kind: "metadata" }> =>
      value.kind === "metadata",
  );
  if (metadata !== undefined) {
    return {
      kind: "metadata",
      parseOk: true,
      value: metadata,
      runtimeSupported: true,
    };
  }

  const values = parsed.value.filter(
    (value): value is ParsedRuntimeEffectLine => value.kind !== "metadata",
  );
  const parserCertificate = createParserSupportCertificate(values);
  const blocks = runtimeBlocksForValues(values, effectId);
  const siblingBlocks = runtimeContext?.siblingBlocks ?? blocks;
  const runtimeResults = blocks.map((block) =>
    evaluateEffectBlockRuntimeSupport(block, { siblingBlocks }),
  );
  const firstFailure = runtimeResults.find((result) => !result.supported);
  const runtimeSupported =
    parserCertificate.complete &&
    runtimeResults.length > 0 &&
    firstFailure === undefined;
  return {
    kind: "effect",
    parseOk: true,
    values,
    runtimeSupported,
    ...(firstFailure?.reason === undefined
      ? {}
      : { runtimeReason: firstFailure.reason }),
    parserCertificate,
    runtimeReports: runtimeResults,
  };
};

const collectRulesTextLines = (
  input: RulesTextValidationInput,
): readonly CollectedRulesTextLine[] => [
  ...collectFieldLines("effect", input.effect),
  ...collectFieldLines("trigger", input.trigger),
];

const collectFieldLines = (
  field: "effect" | "trigger",
  text: string | null | undefined,
): readonly CollectedRulesTextLine[] =>
  gameplayLinesFromTextParts([text]).map((line, index) => ({
    field,
    lineNumber: index + 1,
    text: line,
  }));

const toValidationLine = (
  line: CollectedRulesTextLine,
  evaluation: RulesTextLineEvaluation,
): RulesTextValidationLine => {
  if (!evaluation.parseOk) {
    return {
      ...line,
      parseOk: false,
      runtimeSupported: false,
      stage: evaluation.stage,
      reason: evaluation.reason,
    };
  }

  if (evaluation.kind !== "effect") {
    return {
      ...line,
      parseOk: true,
      runtimeSupported: true,
    };
  }

  return {
    ...line,
    parseOk: true,
    runtimeSupported: evaluation.runtimeSupported,
    ...(evaluation.runtimeReason === undefined
      ? {}
      : { reason: evaluation.runtimeReason }),
  };
};
