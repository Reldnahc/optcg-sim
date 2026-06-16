import type { EffectTextSpan } from "@optcg/types";

import {
  sourceSpan,
  splitSourceByDelimiter,
  type SourceDelimiter,
  type SourceSlice,
} from "../source-slices.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

const sourceFromDelimiterThroughSegment = (
  inputSource: SourceSlice,
  delimiter: SourceDelimiter,
  segment: SourceSlice,
): SourceSlice => {
  const startOffset = delimiter.start - inputSource.start;
  const endOffset = segment.end - inputSource.start;
  const rawText = inputSource.rawText.slice(startOffset, endOffset);
  return {
    text: rawText.trim(),
    rawText,
    start: delimiter.start,
    end: segment.end,
  };
};

export const topDeckSearchPresentationSpans = ({
  input,
  remainingEvidence,
  selectionEvidence,
}: {
  readonly input: ParseInput;
  readonly remainingEvidence: readonly PrimitiveEvidence[];
  readonly selectionEvidence: readonly PrimitiveEvidence[];
}): readonly EffectTextSpan[] => {
  if (input.source === undefined) {
    return [];
  }

  const split = splitSourceByDelimiter(input.source, /\s+Then,\s+/u, "then");
  const selectionSource = split?.segments[0];
  const remainingSegment = split?.segments[1];
  const thenDelimiter = split?.delimiters[0];
  if (
    selectionSource === undefined ||
    remainingSegment === undefined ||
    thenDelimiter === undefined
  ) {
    return [
      sourceSpan(
        "span:search:selection",
        "body",
        input.source,
        selectionEvidence,
      ),
    ];
  }

  return [
    sourceSpan(
      "span:search:selection",
      "body",
      selectionSource,
      selectionEvidence,
    ),
    {
      id: "span:search:then",
      role: "connector",
      start: thenDelimiter.start,
      end: thenDelimiter.end,
      text: thenDelimiter.text,
    },
    sourceSpan(
      "span:search:remaining",
      "body",
      sourceFromDelimiterThroughSegment(
        input.source,
        thenDelimiter,
        remainingSegment,
      ),
      remainingEvidence,
    ),
  ];
};
