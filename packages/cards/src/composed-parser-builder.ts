import type {
  CardId,
  Effect,
  EffectDefinition,
  SequencedEffect,
  Trigger,
} from "@optcg/types";

import type {
  CompleteGeneratedSupportParseResult,
  GeneratedSupportParserResult,
  GeneratedSupportUnparsedSpan,
  PartialGeneratedSupportParseResult,
} from "./generated-support-types.js";

export type SupportedTriggerWrapperParse = {
  readonly bodyText: string;
  readonly prefix: string;
  readonly trigger: Extract<Trigger, { type: "onPlay" | "whenAttacking" }>;
};

export type OncePerTurnWrapperParse = {
  readonly bodyText: string;
  readonly prefix: string;
};

export type SequenceEffect = Extract<Effect, { type: "sequence" }>;

export function parseSupportedTriggerWrapper(
  sourceText: string,
): SupportedTriggerWrapperParse | undefined {
  const supportedTriggers = [
    { prefix: "[On Play] ", trigger: { type: "onPlay" } },
    { prefix: "[When Attacking] ", trigger: { type: "whenAttacking" } },
  ] as const;

  for (const supportedTrigger of supportedTriggers) {
    if (sourceText.startsWith(supportedTrigger.prefix)) {
      return {
        bodyText: sourceText.slice(supportedTrigger.prefix.length),
        prefix: supportedTrigger.prefix,
        trigger: supportedTrigger.trigger,
      };
    }
  }

  return undefined;
}

export function parseOncePerTurnWrapper(
  sourceText: string,
): OncePerTurnWrapperParse | undefined {
  const prefix = "[Once Per Turn] ";
  if (!sourceText.startsWith(prefix)) {
    return undefined;
  }

  return {
    bodyText: sourceText.slice(prefix.length),
    prefix,
  };
}

export function parseExactPositiveSafeInteger(
  countText: string,
): number | undefined {
  const count = Number.parseInt(countText, 10);
  if (!Number.isSafeInteger(count) || count <= 0) {
    return undefined;
  }

  if (countText !== String(count)) {
    return undefined;
  }

  return count;
}

export function buildSequenceEffect(
  segments: readonly SequencedEffect[],
): SequenceEffect {
  return {
    effects: segments.map((segment) => ({ ...segment })),
    type: "sequence",
  };
}

export function createDeterministicParserRuleId(
  parts: readonly string[],
): string {
  if (parts.length === 0) {
    throw new Error("Parser rule IDs require at least one part.");
  }

  if (parts.some((part) => part.length === 0)) {
    throw new Error("Parser rule ID parts must be non-empty.");
  }

  if (parts.some((part) => part.includes(":"))) {
    throw new Error("Parser rule ID parts must not contain ':'.");
  }

  return parts.join(":");
}

export function buildResidueSpan({
  offset,
  prefix,
  source,
}: {
  readonly offset: number;
  readonly prefix: string;
  readonly source: string;
}): GeneratedSupportUnparsedSpan {
  const start = offset + prefix.length;
  return {
    end: offset + source.length,
    start,
    text: source.slice(prefix.length),
  };
}

export function buildCompleteParseResult({
  cardId,
  effectDefinition,
  parserRuleIds,
  sourceText,
  sourceTextHash,
}: {
  readonly cardId: CardId;
  readonly effectDefinition: EffectDefinition;
  readonly parserRuleIds: readonly string[];
  readonly sourceText: string;
  readonly sourceTextHash: string;
}): CompleteGeneratedSupportParseResult {
  return {
    cardId,
    effectDefinition,
    parserRuleIds,
    sourceText,
    sourceTextHash,
    status: "complete",
  };
}

export function buildPartialParseResult({
  cardId,
  message,
  parsedRuleIds,
  sourceText,
  sourceTextHash,
  unparsedSpans,
}: {
  readonly cardId: CardId;
  readonly message: string;
  readonly parsedRuleIds: readonly string[];
  readonly sourceText: string;
  readonly sourceTextHash: string;
  readonly unparsedSpans: readonly GeneratedSupportUnparsedSpan[];
}): PartialGeneratedSupportParseResult {
  return {
    blockers: unparsedSpans.map((span) => ({
      code: "unparsed-span",
      message,
      span,
    })),
    cardId,
    parsedRuleIds,
    sourceText,
    sourceTextHash,
    status: "partial",
    unparsedSpans,
  };
}

export function buildUnsupportedWholeTextParseResult({
  cardId,
  sourceText,
  sourceTextHash,
}: {
  readonly cardId: CardId;
  readonly sourceText: string;
  readonly sourceTextHash: string;
}): GeneratedSupportParserResult {
  return buildPartialParseResult({
    cardId,
    message: "Card text is not covered by certified parser rules.",
    parsedRuleIds: [],
    sourceText,
    sourceTextHash,
    unparsedSpans: [
      {
        end: sourceText.length,
        start: 0,
        text: sourceText,
      },
    ],
  });
}
