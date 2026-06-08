import type {
  Effect,
  EffectTextSpan,
  SelectionId,
  SelectionSetId,
} from "@optcg/types";

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

const searchLookSet = "set:search-look" as SelectionSetId;
const searchHandSelection = "searchSelection:hand" as SelectionId;

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
  const decomposedSearch = createBottomSearchSequence({
    look,
    reveal,
    remaining,
  });
  const baseEffect = decomposedSearch?.effect ?? searchEffect;
  const baseEvidence = decomposedSearch?.evidence ?? searchEvidence;

  if (remaining.rest.length === 0) {
    return {
      effect: baseEffect,
      evidence: baseEvidence,
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
        ...(baseEffect.type === "sequence"
          ? baseEffect.effects
          : [
              {
                connector: "always" as const,
                effect: baseEffect,
              },
            ]),
        {
          connector: "then",
          effect: trailing.effect,
        },
      ],
    },
    evidence: ["expression:sequence", ...baseEvidence, ...trailing.evidence],
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

type ParsedSearchParts = {
  readonly look: NonNullable<ReturnType<typeof parseTopDeckLook>>;
  readonly reveal: NonNullable<ReturnType<typeof parseSearchSelectionToHand>>;
  readonly remaining:
    | NonNullable<ReturnType<typeof parseRestToBottomAnyOrder>>
    | NonNullable<ReturnType<typeof parseRestToTrash>>;
};

const createBottomSearchSequence = ({
  look,
  reveal,
  remaining,
}: ParsedSearchParts):
  | {
      readonly effect: Extract<Effect, { type: "sequence" }>;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  if (remaining.remainingCards.destination !== "deck") {
    return undefined;
  }

  const selectedReveal =
    reveal.revealTo === "bothPlayers"
      ? [
          {
            connector: "ifPreviousSucceeded" as const,
            effect: {
              type: "revealSelected" as const,
              selection: searchHandSelection,
              visibility: "bothPlayers" as const,
            },
          },
        ]
      : [];

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "revealTop",
            player: "self",
            zone: "deck",
            count: look.count,
            saveAs: searchLookSet,
            visibility: "chooserOnly",
          },
        },
        {
          connector: "then",
          effect: {
            type: "selectFromSet",
            set: searchLookSet,
            chooser: "self",
            min: reveal.min,
            max: reveal.max,
            filter: reveal.filter,
            saveAs: searchHandSelection,
          },
        },
        ...selectedReveal,
        {
          connector: "ifPreviousSucceeded",
          effect: {
            type: "moveSelected",
            selection: searchHandSelection,
            from: searchLookSet,
            to: "hand",
          },
        },
        {
          connector: "then",
          effect: {
            type: "placeSetRemainder",
            set: searchLookSet,
            owner: "self",
            destination: "deck",
            position: "bottom",
            order: "chooser",
          },
        },
      ],
    },
    evidence: [
      "expression:sequence",
      "instruction:revealTop",
      ...look.evidence,
      "instruction:selectFromSet",
      ...reveal.evidence,
      ...(reveal.revealTo === "bothPlayers"
        ? (["instruction:revealSelected"] as const)
        : []),
      "instruction:moveSelected",
      "instruction:placeSetRemainder",
      ...remaining.evidence,
    ],
  };
};

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
