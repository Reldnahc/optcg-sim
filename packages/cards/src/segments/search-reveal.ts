import type { EffectTextSpan } from "@optcg/types";

import type {
  ExpressionParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import {
  parseRestToTrash,
  parseRestToBottomAnyOrder,
  parseSearchSelectionToHand,
  parseTopDeckLook,
} from "../search/index.js";
import { parseExpression } from "../expression-parser.js";
import { parseThenConnector } from "../connectors/index.js";
import {
  parsePlayFromHandInstruction,
  parseTrashFromHandInstruction,
} from "../instructions/index.js";
import {
  sourceSpan,
  splitSourceByDelimiter,
  type SourceDelimiter,
  type SourceSlice,
} from "../source-slices.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";

export function searchRevealExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const look = parseTopDeckLook(input);
  if (look === undefined) {
    return undefined;
  }

  const reveal = parseSearchSelectionToHand({ text: look.rest });
  if (reveal === undefined) {
    return undefined;
  }

  const remaining =
    parseRestToBottomAnyOrder({ text: reveal.rest }) ??
    parseRestToTrash({ text: reveal.rest });
  if (remaining === undefined) {
    return undefined;
  }

  const searchEffect = {
    type: "search" as const,
    request: {
      zone: "deck" as const,
      player: "self" as const,
      lookCount: look.count,
      filter: reveal.filter,
      min: reveal.min,
      max: reveal.max,
      destination: "hand" as const,
      revealTo: reveal.revealTo,
      remainingCards: remaining.remainingCards,
      shuffleAfter: false,
    },
  };
  const searchEvidence = [
    "instruction:search",
    ...look.evidence,
    ...reveal.evidence,
    ...remaining.evidence,
  ] as const;
  const presentationSpans = searchRevealPresentationSpans({
    input,
    remainingEvidence: remaining.evidence,
    searchEvidence,
  });

  if (remaining.rest.length === 0) {
    return {
      effect: searchEffect,
      evidence: searchEvidence,
      rest: "",
      ...(presentationSpans.length === 0 ? {} : { presentationSpans }),
    };
  }

  const trailing = parseExpression(remaining.rest, {
    connectors: [parseThenConnector],
    segments: [
      syntheticInstructionSegmentParser([parseTrashFromHandInstruction]),
      syntheticInstructionSegmentParser([parsePlayFromHandInstruction]),
    ],
  });
  if (trailing === undefined || trailing.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: searchEffect,
        },
        {
          connector: "then",
          effect: trailing.effect,
        },
      ],
    },
    evidence: ["expression:sequence", ...searchEvidence, ...trailing.evidence],
    rest: "",
    ...(presentationSpans.length === 0
      ? trailing.presentationSpans === undefined
        ? {}
        : { presentationSpans: trailing.presentationSpans }
      : {
          presentationSpans: [
            ...presentationSpans,
            ...(trailing.presentationSpans ?? []),
          ],
        }),
  };
}

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

const searchRevealPresentationSpans = ({
  input,
  remainingEvidence,
  searchEvidence,
}: {
  readonly input: ParseInput;
  readonly remainingEvidence: readonly PrimitiveEvidence[];
  readonly searchEvidence: readonly PrimitiveEvidence[];
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
      sourceSpan("span:search:selection", "body", input.source, searchEvidence),
    ];
  }

  return [
    sourceSpan(
      "span:search:selection",
      "body",
      selectionSource,
      searchEvidence,
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
