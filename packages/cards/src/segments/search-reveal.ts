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
  parseRestToTopOrBottomAnyOrder,
  parseSearchSelectionToHand,
  parseTopDeckLook,
} from "../search/index.js";
import { parseExpression } from "../expression-parser.js";
import { parseThenConnector } from "../connectors/index.js";
import {
  parsePlayFromHandInstruction,
  parseTrashFromHandInstruction,
} from "../instructions/index.js";
import { syntheticInstructionSegmentParser } from "./synthetic.js";
import { topDeckSearchPresentationSpans } from "./top-deck-presentation-spans.js";

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
    parseRestToTopOrBottomAnyOrder({ text: reveal.rest }) ??
    parseRestToTrash({ text: reveal.rest });
  if (remaining === undefined) {
    return undefined;
  }

  const decomposedSearch = createTopDeckSearchSequence({
    look,
    reveal,
    remaining,
  });
  const selectionEvidence = searchRevealSelectionEvidence({ look, reveal });
  const presentationSpans = searchRevealPresentationSpans({
    input,
    remainingEvidence: remaining.evidence,
    selectionEvidence,
  });

  if (remaining.rest.length === 0) {
    return {
      effect: decomposedSearch.effect,
      evidence: decomposedSearch.evidence,
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
        ...decomposedSearch.effect.effects,
        {
          connector: "then",
          effect: trailing.effect,
        },
      ],
    },
    evidence: [
      "expression:sequence",
      ...decomposedSearch.evidence,
      ...trailing.evidence,
    ],
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

const createTopDeckSearchSequence = ({
  look,
  reveal,
  remaining,
}: ParsedSearchParts): {
  readonly effect: Extract<Effect, { type: "sequence" }>;
  readonly evidence: readonly PrimitiveEvidence[];
} => {
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
  const remainder =
    remaining.remainingCards.destination === "deck"
      ? {
          destination: "deck" as const,
          position: remaining.remainingCards.position,
          order: "chooser" as const,
        }
      : {
          destination: "trash" as const,
          position: "bottom" as const,
          order: "original" as const,
        };

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
            ...remainder,
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

const searchRevealSelectionEvidence = ({
  look,
  reveal,
}: Pick<ParsedSearchParts, "look" | "reveal">): readonly PrimitiveEvidence[] =>
  [
    "expression:sequence",
    "instruction:revealTop",
    ...look.evidence,
    "instruction:selectFromSet",
    ...reveal.evidence,
    ...(reveal.revealTo === "bothPlayers"
      ? (["instruction:revealSelected"] as const)
      : []),
    "instruction:moveSelected",
  ] as const;

const searchRevealPresentationSpans = ({
  input,
  remainingEvidence,
  selectionEvidence,
}: {
  readonly input: ParseInput;
  readonly remainingEvidence: readonly PrimitiveEvidence[];
  readonly selectionEvidence: readonly PrimitiveEvidence[];
}): readonly EffectTextSpan[] => {
  return topDeckSearchPresentationSpans({
    input,
    remainingEvidence: ["instruction:placeSetRemainder", ...remainingEvidence],
    selectionEvidence,
  });
};
