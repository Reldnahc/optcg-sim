import type { CardFilter, Effect, SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { sourceSpan } from "../source-slices.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

const deckRevealToHandSelection = "deckSelection:revealToHand" as SelectionId;

export function deckRevealToHandExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const revealMatch = /^reveal\s+(?<rest>.+)$/iu.exec(input.text);
  const afterReveal = revealMatch?.groups?.["rest"];
  if (afterReveal === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: afterReveal });
  if (cardinality === undefined) {
    return undefined;
  }

  const destinationMatch =
    /^(?<filterText>.+?)\s+from your deck and add it to your hand\.\s+then,?\s+shuffle your deck\.?$/iu.exec(
      cardinality.rest,
    );
  const filterText = destinationMatch?.groups?.["filterText"];
  if (filterText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({ text: filterText });
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  const evidence = [
    "expression:sequence",
    "instruction:selectCards",
    ...cardinality.evidence,
    ...predicates.evidence,
    "zone:deck",
    "reveal:bothPlayers",
    "instruction:revealSelected",
    "instruction:moveSelected",
    "instruction:shuffleDeck",
  ] as const;

  return {
    effect: createDeckRevealToHandShuffleSequence({
      filter: predicates.filter,
      max: cardinality.cardinality.max,
      min: cardinality.cardinality.min,
    }),
    evidence,
    rest: "",
    ...(input.source === undefined
      ? {}
      : {
          presentationSpans: [
            sourceSpan("span:body", "body", input.source, evidence),
          ],
        }),
  };
}

function createDeckRevealToHandShuffleSequence({
  filter,
  max,
  min,
}: {
  readonly filter: CardFilter;
  readonly max: number;
  readonly min: number;
}): Extract<Effect, { type: "sequence" }> {
  return {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "selectCards",
          zone: "deck",
          player: "self",
          chooser: "self",
          filter,
          min,
          max,
          saveAs: deckRevealToHandSelection,
          visibility: "chooserOnly",
        },
      },
      {
        connector: "ifPreviousSucceeded",
        effect: {
          type: "revealSelected",
          selection: deckRevealToHandSelection,
          visibility: "bothPlayers",
        },
      },
      {
        connector: "ifPreviousSucceeded",
        effect: {
          type: "moveSelected",
          selection: deckRevealToHandSelection,
          from: "deck",
          to: "hand",
        },
      },
      {
        connector: "then",
        effect: { type: "shuffleDeck", player: "self" },
      },
    ],
  };
}
