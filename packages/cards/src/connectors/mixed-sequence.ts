import type { EffectTextSpan } from "@optcg/types";

import { trimSource, type SourceSlice } from "../source-slices.js";
import type {
  ConnectorParseResult,
  ConnectorParser,
  PrimitiveEvidence,
} from "../types.js";

const mixedDelimiter =
  /\.\s+Then,\s+(?!place the rest\b)|\s+Then,\s+(?!place the rest\b)|,\s+then\s+(?!place the rest\b)|\.(?!\s+If you do,)\s+(?=[A-Z])/giu;

type ConnectorKind = "then" | "sentence";

const connectorKind = (delimiter: string): ConnectorKind =>
  /\bthen\b/iu.test(delimiter) ? "then" : "sentence";

const connectorEvidence = (kind: ConnectorKind): PrimitiveEvidence =>
  kind === "then" ? "connector:then" : "connector:sentence";

const sourceText = (source: SourceSlice | undefined, text: string): string =>
  source?.rawText ?? text;

export const parseMixedSequenceConnector: ConnectorParser = (input) => {
  const rawText = sourceText(input.source, input.text);
  const matches = [...rawText.matchAll(mixedDelimiter)];
  if (matches.length === 0) {
    return undefined;
  }

  const segments: string[] = [];
  const sourceSegments: SourceSlice[] = [];
  const connectorSpans: EffectTextSpan[] = [];
  const evidence = new Set<PrimitiveEvidence>();
  let lastIndex = 0;

  for (const [index, match] of matches.entries()) {
    const delimiterRaw = match[0];
    const delimiterIndex = match.index;
    if (delimiterRaw.length === 0) {
      continue;
    }

    const segmentRaw = rawText.slice(lastIndex, delimiterIndex);
    const segment = trimSource({
      text: segmentRaw,
      rawText: segmentRaw,
      start: (input.source?.start ?? 0) + lastIndex,
      end: (input.source?.start ?? 0) + delimiterIndex,
    });
    if (segment.text.length > 0) {
      segments.push(segment.text);
      sourceSegments.push(segment);
    }

    const kind = connectorKind(delimiterRaw);
    const primitiveEvidence = connectorEvidence(kind);
    evidence.add(primitiveEvidence);
    const delimiter = trimSource({
      text: delimiterRaw,
      rawText: delimiterRaw,
      start: (input.source?.start ?? 0) + delimiterIndex,
      end: (input.source?.start ?? 0) + delimiterIndex + delimiterRaw.length,
    });
    connectorSpans.push({
      id: `span:connector:${kind}:${String(index)}`,
      role: "connector",
      start: delimiter.start,
      end: delimiter.end,
      text: delimiter.text,
      primitiveEvidence: [primitiveEvidence],
    });
    lastIndex = delimiterIndex + delimiterRaw.length;
  }

  const finalRaw = rawText.slice(lastIndex);
  const finalSegment = trimSource({
    text: finalRaw,
    rawText: finalRaw,
    start: (input.source?.start ?? 0) + lastIndex,
    end: input.source?.end ?? rawText.length,
  });
  if (finalSegment.text.length > 0) {
    segments.push(finalSegment.text);
    sourceSegments.push(finalSegment);
  }

  if (segments.length <= 1 || evidence.size <= 1) {
    return undefined;
  }

  return {
    segments,
    connectors: segments.map((_, index) => (index === 0 ? "always" : "then")),
    ...(input.source === undefined ? {} : { sourceSegments }),
    connectorSpans,
    evidence: [...evidence],
  } satisfies ConnectorParseResult;
};
