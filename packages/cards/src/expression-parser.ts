import type { Effect, EffectTextSpan, SequencedEffect } from "@optcg/types";

import type {
  ConnectorParser,
  ConnectorParseResult,
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
  SegmentParseResult,
  SegmentParser,
} from "./types.js";
import { sourceSpan, type SourceSlice } from "./source-slices.js";

export interface ExpressionParserRegistry {
  readonly connectors: readonly ConnectorParser[];
  readonly segments: readonly SegmentParser[];
}

export function parseExpression(
  input: string | ParseInput,
  registry: ExpressionParserRegistry,
): ExpressionParseResult | undefined {
  const parseInput = typeof input === "string" ? { text: input } : input;
  for (const connectorParse of connectorParseAttempts(
    parseInput,
    registry.connectors,
  )) {
    const parsed = parseExpressionWithConnectorParse(
      parseInput,
      registry,
      connectorParse,
    );
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function parseExpressionWithConnectorParse(
  parseInput: ParseInput,
  registry: ExpressionParserRegistry,
  connectorParse: ConnectorParseResult | undefined,
): ExpressionParseResult | undefined {
  const segmentTexts = connectorParse?.segments ?? [parseInput.text];
  const segmentSources =
    connectorParse?.sourceSegments ??
    (parseInput.source === undefined ? undefined : [parseInput.source]);
  const connectors =
    connectorParse?.connectors ??
    (["always"] satisfies readonly SequencedEffect["connector"][]);
  const evidence: PrimitiveEvidence[] = [];
  const parsedSegments: SegmentParseResult[] = [];

  for (const [index, segmentText] of segmentTexts.entries()) {
    const parsed = parseSegment(
      segmentText,
      registry.segments,
      segmentSources?.[index],
      parseInput.entryPoint,
    );
    if (parsed === undefined) {
      return undefined;
    }

    if (index > 0 && connectorParse !== undefined) {
      evidence.push(...connectorParse.evidence);
    }

    evidence.push(...parsed.evidence);
    parsedSegments.push(parsed);
  }

  if (parsedSegments.length === 0) {
    return undefined;
  }

  const normalizedSegments = absorbConditionalDependentSiblings(
    parsedSegments,
    connectors,
  );

  if (normalizedSegments.length === 1) {
    const only = normalizedSegments[0]?.segment;
    const presentationSpans =
      only === undefined ? [] : spansForSegment(only, segmentSources?.[0]);
    return only === undefined
      ? undefined
      : {
          effect: only.effect,
          ...(only.saveResultAs === undefined
            ? {}
            : { saveResultAs: only.saveResultAs }),
          evidence: only.evidence,
          rest: "",
          ...(presentationSpans.length === 0 ? {} : { presentationSpans }),
        };
  }

  const presentationSpans = [
    ...(connectorParse?.connectorSpans ?? []),
    ...parsedSegments.flatMap((segment, index) =>
      rewriteSequenceSpanIds(
        spansForSegment(segment, segmentSources?.[index]),
        index,
      ),
    ),
  ];

  return {
    effect: {
      type: "sequence",
      effects: normalizedSegments.map(
        ({ segment, connector }): SequencedEffect => ({
          connector,
          ...(segment.saveResultAs === undefined
            ? {}
            : { saveResultAs: segment.saveResultAs }),
          effect: segment.effect,
        }),
      ),
    },
    evidence: ["expression:sequence", ...evidence],
    rest: "",
    ...(presentationSpans.length === 0 ? {} : { presentationSpans }),
  };
}

type NormalizedExpressionSegment = {
  readonly connector: SequencedEffect["connector"];
  readonly segment: SegmentParseResult;
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const collectSavedReferenceIds = (
  value: unknown,
  key: "saveResultAs" | "saveAs",
  ids: Set<string>,
): void => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSavedReferenceIds(item, key, ids);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  const saved = value[key];
  if (typeof saved === "string") {
    ids.add(saved);
  }
  for (const nested of Object.values(value)) {
    collectSavedReferenceIds(nested, key, ids);
  }
};

const producedSavedReferences = (effect: Effect): ReadonlySet<string> => {
  const ids = new Set<string>();
  collectSavedReferenceIds(effect, "saveResultAs", ids);
  collectSavedReferenceIds(effect, "saveAs", ids);
  return ids;
};

const segmentConsumesAnyReference = (
  segment: SegmentParseResult,
  references: ReadonlySet<string>,
): boolean => {
  if (references.size === 0) {
    return false;
  }
  return consumesAnySavedFieldObjectReference(segment.effect, references);
};

const consumesAnySavedFieldObjectReference = (
  value: unknown,
  references: ReadonlySet<string>,
): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) =>
      consumesAnySavedFieldObjectReference(item, references),
    );
  }
  if (!isRecord(value)) {
    return false;
  }
  const binding = value["binding"];
  if (isRecord(binding) && typeof binding["saveResultAs"] === "string") {
    return references.has(binding["saveResultAs"]);
  }
  return Object.values(value).some((nested) =>
    consumesAnySavedFieldObjectReference(nested, references),
  );
};

const appendSegmentsToConditionalThen = (
  effect: Effect,
  segments: readonly SequencedEffect[],
): Effect => {
  if (effect.type !== "conditional" || segments.length === 0) {
    return effect;
  }
  const baseThen =
    effect.then.type === "sequence"
      ? effect.then
      : {
          type: "sequence" as const,
          effects: [
            {
              connector: "always" as const,
              effect: effect.then,
            },
          ],
        };
  return {
    ...effect,
    then: {
      type: "sequence",
      effects: [...baseThen.effects, ...segments],
    },
  };
};

const toSequencedEffect = (
  segment: SegmentParseResult,
  connector: SequencedEffect["connector"],
): SequencedEffect => ({
  connector,
  ...(segment.saveResultAs === undefined
    ? {}
    : { saveResultAs: segment.saveResultAs }),
  effect: segment.effect,
});

const absorbConditionalDependentSiblings = (
  segments: readonly SegmentParseResult[],
  connectors: readonly SequencedEffect["connector"][],
): readonly NormalizedExpressionSegment[] => {
  const normalized: NormalizedExpressionSegment[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      continue;
    }
    const connector = connectors[index] ?? "then";
    if (segment.effect.type !== "conditional") {
      normalized.push({ connector, segment });
      continue;
    }

    const produced = producedSavedReferences(segment.effect.then);
    const absorbed: SequencedEffect[] = [];
    const absorbedSegments: SegmentParseResult[] = [];
    let cursor = index + 1;
    while (cursor < segments.length) {
      const nextSegment = segments[cursor];
      const nextConnector = connectors[cursor] ?? "then";
      if (
        nextSegment === undefined ||
        nextConnector === "always" ||
        !segmentConsumesAnyReference(nextSegment, produced)
      ) {
        break;
      }
      absorbed.push(toSequencedEffect(nextSegment, nextConnector));
      absorbedSegments.push(nextSegment);
      cursor += 1;
    }

    normalized.push({
      connector,
      segment: {
        ...segment,
        effect: appendSegmentsToConditionalThen(segment.effect, absorbed),
        evidence: [
          ...segment.evidence,
          ...absorbedSegments.flatMap((item) => item.evidence),
        ],
        presentationSpans: [
          ...(segment.presentationSpans ?? []),
          ...absorbedSegments.flatMap((item) => item.presentationSpans ?? []),
        ],
      },
    });
    index = cursor - 1;
  }
  return normalized;
};

function spansForSegment(
  segment: SegmentParseResult,
  source: SourceSlice | undefined,
): readonly EffectTextSpan[] {
  const spans = segment.presentationSpans ?? [];
  if (source === undefined || spans.some((span) => span.role === "body")) {
    return spans;
  }

  return [sourceSpan("span:body", "body", source, segment.evidence), ...spans];
}

function parseSegment(
  text: string,
  parsers: readonly SegmentParser[],
  source?: ParseInput["source"],
  entryPoint?: ParseInput["entryPoint"],
): SegmentParseResult | undefined {
  for (const parser of parsers) {
    const result = parser({
      text,
      ...(source === undefined ? {} : { source }),
      ...(entryPoint === undefined ? {} : { entryPoint }),
    });
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

function connectorParseAttempts(
  input: ParseInput,
  parsers: readonly ConnectorParser[],
): readonly (ConnectorParseResult | undefined)[] {
  const attempts: (ConnectorParseResult | undefined)[] = [];
  for (const parser of parsers) {
    const result = parser(input);
    if (result !== undefined) {
      attempts.push(result);
    }
  }
  attempts.push(undefined);
  return attempts;
}

function rewriteSequenceSpanIds(
  spans: readonly EffectTextSpan[],
  sequenceIndex: number,
): readonly EffectTextSpan[] {
  return spans.map((span) => {
    const id = sequenceScopedSpanId(span.id, sequenceIndex);
    const parentSpanId =
      span.parentSpanId === undefined
        ? undefined
        : sequenceScopedSpanId(span.parentSpanId, sequenceIndex);
    if (id === span.id && parentSpanId === span.parentSpanId) {
      return span;
    }
    return {
      ...span,
      id,
      ...(parentSpanId === undefined ? {} : { parentSpanId }),
      sequenceIndex,
    };
  });
}

const sequenceScopedSpanId = (
  spanId: EffectTextSpan["id"],
  sequenceIndex: number,
): EffectTextSpan["id"] => {
  if (spanId === "span:body") {
    return `span:sequence:${String(sequenceIndex)}:body`;
  }
  if (spanId.startsWith("span:sequence:")) {
    return `span:sequence:${String(sequenceIndex)}:${spanId.slice(
      "span:".length,
    )}`;
  }
  if (spanId.startsWith("span:condition:")) {
    return `span:sequence:${String(sequenceIndex)}:${spanId.slice(
      "span:".length,
    )}`;
  }
  return spanId;
};
