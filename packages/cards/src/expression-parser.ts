import type { SequencedEffect } from "@optcg/types";

import type {
  ConnectorParser,
  ExpressionParseResult,
  PrimitiveEvidence,
  SegmentParseResult,
  SegmentParser,
} from "./types.js";

export interface ExpressionParserRegistry {
  readonly connectors: readonly ConnectorParser[];
  readonly segments: readonly SegmentParser[];
}

export function parseExpression(
  text: string,
  registry: ExpressionParserRegistry,
): ExpressionParseResult | undefined {
  const connectorParse = parseConnectors(text, registry.connectors);
  const segmentTexts = connectorParse?.segments ?? [text];
  const connectors =
    connectorParse?.connectors ??
    (["always"] satisfies readonly SequencedEffect["connector"][]);
  const evidence: PrimitiveEvidence[] = [];
  const parsedSegments: SegmentParseResult[] = [];

  for (const [index, segmentText] of segmentTexts.entries()) {
    const parsed = parseSegment(segmentText, registry.segments);
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
    return only === undefined
      ? undefined
      : { effect: only.effect, evidence: only.evidence, rest: "" };
  }

  return {
    effect: {
      type: "sequence",
      effects: parsedSegments.map(
        (segment, index): SequencedEffect => ({
          connector: connectors[index] ?? "then",
          effect: segment.effect,
        }),
      ),
    },
    evidence: ["expression:sequence", ...evidence],
    rest: "",
  };
}

function parseSegment(
  text: string,
  parsers: readonly SegmentParser[],
): SegmentParseResult | undefined {
  for (const parser of parsers) {
    const result = parser({ text });
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

function parseConnectors(text: string, parsers: readonly ConnectorParser[]) {
  for (const parser of parsers) {
    const result = parser({ text });
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}
