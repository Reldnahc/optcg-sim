import type { EffectTextSpan, SequencedEffect } from "@optcg/types";

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

  if (parsedSegments.length === 1) {
    const only = parsedSegments[0];
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
      effects: parsedSegments.map(
        (segment, index): SequencedEffect => ({
          connector: connectors[index] ?? "then",
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
): SegmentParseResult | undefined {
  for (const parser of parsers) {
    const result = parser({
      text,
      ...(source === undefined ? {} : { source }),
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
  return spans.map((span) =>
    span.id === "span:body"
      ? {
          ...span,
          id: `span:sequence:${String(sequenceIndex)}:body`,
          sequenceIndex,
        }
      : span,
  );
}
