import type { SelectionId } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseStageTypeCardFilter } from "../search/index.js";
import { sourceSpan } from "../source-slices.js";
import type { ExpressionParseResult, ParseInput } from "../types.js";

const startOfGameSelection = "selected:start-of-game" as SelectionId;

export function playStageFromDeckExpressionParser(
  input: ParseInput,
): ExpressionParseResult | undefined {
  const playMatch = /^play\s+(?<rest>.+)$/i.exec(input.text);
  const afterPlay = playMatch?.groups?.["rest"];
  if (afterPlay === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: afterPlay });
  if (cardinality === undefined) {
    return undefined;
  }

  const filter = parseStageTypeCardFilter({ text: cardinality.rest });
  if (filter === undefined) {
    return undefined;
  }

  const destinationMatch = /^\s*from your deck\.?$/i.exec(filter.rest);
  if (destinationMatch === null) {
    return undefined;
  }

  const evidence = [
    "expression:sequence",
    "instruction:search",
    "instruction:playSelected",
    ...cardinality.evidence,
    ...filter.evidence,
    "zone:deck",
    "destination:stageArea",
    "reveal:chooserOnly",
  ] as const;
  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "search",
            request: {
              zone: "deck",
              player: "self",
              filter: filter.filter,
              min: cardinality.cardinality.min,
              max: cardinality.cardinality.max,
              destination: "stageArea",
              revealTo: "chooserOnly",
              shuffleAfter: false,
            },
          },
        },
        {
          connector: "always",
          effect: {
            type: "playSelected",
            selection: startOfGameSelection,
            ignoreCost: true,
          },
        },
      ],
    },
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
