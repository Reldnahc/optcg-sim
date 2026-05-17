import type {
  CardId,
  Effect,
  EffectDefinition,
  SequencedEffect,
  Trigger,
} from "@optcg/types";

import type {
  CompleteGeneratedSupportParseResult,
  GeneratedSupportDiagnosticDecomposition,
  GeneratedSupportParserResult,
  GeneratedSupportDiagnosticTraceComponent,
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

export type IfWrapperParse = {
  readonly bodyText: string;
  readonly conditions: readonly string[];
  readonly connector?: "and" | "or";
  readonly prefix: "If ";
};

export type UpToCardinalityParse = {
  readonly max: number;
  readonly min: 0;
  readonly text: string;
};

export type QuantityComparatorParse = {
  readonly field: "cost" | "power";
  readonly op: "gte" | "lte";
  readonly text: string;
  readonly value: number;
};

export type BooleanConnectorCandidate = {
  readonly connector: "and" | "or";
  readonly left: string;
  readonly right: string;
};

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

export function parseIfWrapper(sourceText: string): IfWrapperParse | undefined {
  const match = /^If\s+(.+?),\s*(.+)$/i.exec(sourceText.trim());
  if (match === null) {
    return undefined;
  }

  const conditionText = match[1]?.trim() ?? "";
  const bodyText = match[2]?.trim() ?? "";
  if (conditionText.length === 0 || bodyText.length === 0) {
    return undefined;
  }

  const connector = parseBooleanConnectorCandidate(conditionText);
  if (connector === undefined) {
    return {
      bodyText,
      conditions: [conditionText],
      prefix: "If ",
    };
  }

  return {
    bodyText,
    conditions: [connector.left, connector.right],
    connector: connector.connector,
    prefix: "If ",
  };
}

export function parseUpToCardinality(
  sourceText: string,
): UpToCardinalityParse | undefined {
  const match = /^up to (\d+)$/i.exec(sourceText.trim());
  if (match === null) {
    return undefined;
  }

  const max = parseExactPositiveSafeInteger(match[1] ?? "");
  if (max === undefined) {
    return undefined;
  }

  return {
    max,
    min: 0,
    text: match[0],
  };
}

export function parseQuantityComparator(
  sourceText: string,
): QuantityComparatorParse | undefined {
  const match = /^(\d+)\s+(power|cost)\s+or\s+(less|more)$/i.exec(
    sourceText.trim(),
  );
  if (match === null) {
    return undefined;
  }

  const value = parseExactPositiveSafeInteger(match[1] ?? "");
  if (value === undefined) {
    return undefined;
  }

  const fieldText = match[2]?.toLowerCase();
  const directionText = match[3]?.toLowerCase();
  if (
    (fieldText !== "power" && fieldText !== "cost") ||
    (directionText !== "less" && directionText !== "more")
  ) {
    return undefined;
  }

  return {
    field: fieldText,
    op: directionText === "less" ? "lte" : "gte",
    text: match[0],
    value,
  };
}

export function parseBooleanConnectorCandidate(
  sourceText: string,
): BooleanConnectorCandidate | undefined {
  if (parseQuantityComparator(sourceText) !== undefined) {
    return undefined;
  }

  const match = /^(.+?)\s+(and|or)\s+(.+)$/i.exec(sourceText.trim());
  if (match === null) {
    return undefined;
  }

  const left = match[1]?.trim() ?? "";
  const connector = match[2]?.toLowerCase();
  const right = match[3]?.trim() ?? "";
  if (
    left.length === 0 ||
    right.length === 0 ||
    (connector !== "and" && connector !== "or")
  ) {
    return undefined;
  }

  return { connector, left, right };
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

export function deriveParserDiagnosticDecomposition(
  text: string,
  fullSourceText: string,
): GeneratedSupportDiagnosticDecomposition | undefined {
  const normalized = text.trim();
  if (normalized !== fullSourceText.trim()) {
    return undefined;
  }

  return (
    deriveConditionalDrawDiagnosticDecomposition(normalized) ??
    deriveBottomDeckDiagnosticDecomposition(normalized)
  );
}

function deriveConditionalDrawDiagnosticDecomposition(
  sourceText: string,
): GeneratedSupportDiagnosticDecomposition | undefined {
  const trigger = parseSupportedTriggerWrapper(sourceText);
  if (trigger === undefined || trigger.prefix !== "[On Play] ") {
    return undefined;
  }

  const conditional = parseIfWrapper(trigger.bodyText);
  if (conditional === undefined || conditional.connector === undefined) {
    return undefined;
  }

  const actionMatch = /^(draw\s+[1-9]\d*\s+cards?)\.?$/i.exec(
    conditional.bodyText,
  );
  const drawCandidate = actionMatch?.[1]?.trim();
  if (drawCandidate === undefined) {
    return undefined;
  }

  return {
    recognizedActionCandidates: [drawCandidate],
    recognizedSyntaxFragments: ["if-conditional-wrapper"],
    recognizedTriggerCandidates: [trigger.prefix.trim()],
    reason:
      "Conditional wrapper syntax was recognized, but the condition predicates and their conjunction are not certified for this generated-support template; generated support remains fail-closed.",
    traceComponents: [
      { kind: "trigger", status: "recognized", text: trigger.prefix.trim() },
      { kind: "wrapper", status: "recognized", text: "If" },
      {
        kind: "condition-connector",
        status: "recognized",
        text: conditional.connector,
      },
      {
        kind: "action",
        status: "supported",
        text: drawCandidate,
      },
      ...conditional.conditions.map(
        (condition): GeneratedSupportDiagnosticTraceComponent => ({
          kind: "condition",
          status: "unsupported",
          text: condition,
        }),
      ),
    ],
    unsupportedConditionFragments: conditional.conditions,
    unsupportedSyntaxFragments: [
      `condition conjunction: ${conditional.connector}`,
    ],
  };
}

function deriveBottomDeckDiagnosticDecomposition(
  sourceText: string,
): GeneratedSupportDiagnosticDecomposition | undefined {
  const trigger = parseSupportedTriggerWrapper(sourceText);
  if (trigger === undefined || trigger.prefix !== "[On Play] ") {
    return undefined;
  }

  const match =
    /^Place\s+(up to \d+)\s+of\s+(your opponent's Characters)\s+with\s+(\d+\s+(?:power|cost)\s+or\s+(?:less|more))\s+at\s+the bottom of the owner's deck\.?$/i.exec(
      trigger.bodyText,
    );
  if (match === null) {
    return undefined;
  }

  const cardinalityText = match[1] ?? "";
  const targetText = match[2] ?? "";
  const predicateText = match[3] ?? "";
  if (
    parseUpToCardinality(cardinalityText) === undefined ||
    parseQuantityComparator(predicateText) === undefined
  ) {
    return undefined;
  }

  return {
    recognizedActionCandidates: ["place at the bottom of the owner's deck"],
    recognizedSyntaxFragments: [
      "trigger-wrapper:onPlay",
      "cardinality:up-to",
      "target:opponent-characters",
      "predicate:quantity-comparator",
      "destination:owner-deck-bottom",
    ],
    recognizedTriggerCandidates: [trigger.prefix.trim()],
    reason:
      "Parser components were recognized, but the complete action/destination shape is not certified with existing schema and runtime capability evidence; generated support remains fail-closed.",
    traceComponents: [
      { kind: "trigger", status: "recognized", text: trigger.prefix.trim() },
      { kind: "cardinality", status: "recognized", text: cardinalityText },
      { kind: "target", status: "recognized", text: targetText },
      { kind: "predicate", status: "recognized", text: predicateText },
      {
        kind: "action",
        status: "recognized",
        text: "place at the bottom of the owner's deck",
      },
      {
        kind: "destination",
        status: "unsupported",
        text: "bottom of the owner's deck",
      },
    ],
    unsupportedConditionFragments: [],
    unsupportedSyntaxFragments: ["action/destination:bottom-of-owner-deck"],
  };
}
