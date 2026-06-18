import type { CardFilter, Effect, SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { sourceSpan } from "../source-slices.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

const deckPlaySelection = "deckSelection:play" as SelectionId;

export function playFromDeckExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const playMatch = /^play\s+(?<rest>.+)$/iu.exec(input.text);
  const afterPlay = playMatch?.groups?.["rest"];
  if (afterPlay === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: afterPlay });
  if (cardinality === undefined) {
    return undefined;
  }

  const destinationMatch =
    /^(?<filterText>.+?)\s+from your deck(?:\.|,)\s+then,?\s+shuffle your deck\.?$/iu.exec(
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
    "reveal:chooserOnly",
    "instruction:playSelected",
    "instruction:shuffleDeck",
  ] as const;

  return {
    effect: createDeckPlayShuffleSequence({
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

function createDeckPlayShuffleSequence({
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
          saveAs: deckPlaySelection,
          visibility: "chooserOnly",
        },
      },
      {
        connector: "ifPreviousSucceeded",
        effect: {
          type: "playSelected",
          selection: deckPlaySelection,
          ignoreCost: true,
        },
      },
      {
        connector: "then",
        effect: { type: "shuffleDeck", player: "self" },
      },
    ],
  };
}
