import type { CardFilter } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";
import { parseTypeCardFilter } from "./type-card-filter.js";

export interface RevealToHandParseResult {
  readonly filter: CardFilter;
  readonly min: number;
  readonly max: number;
  readonly revealTo: "bothPlayers" | "chooserOnly";
  readonly rest: string;
  readonly evidence: readonly PrimitiveEvidence[];
}

export function parseRevealUpToTypeCardToHand(
  input: ParseInput,
): RevealToHandParseResult | undefined {
  const actionMatch = /^reveal\s+(?<rest>.+)$/i.exec(input.text);
  const cardinalityText = actionMatch?.groups?.["rest"];
  if (cardinalityText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: cardinalityText });
  if (cardinality === undefined) {
    return undefined;
  }

  const filter = parseTypeCardFilter({ text: cardinality.rest });
  if (filter === undefined) {
    return undefined;
  }

  const destinationMatch = /^ and add it to your hand\.\s+(?<rest>.+)$/i.exec(
    filter.rest,
  );
  const rest = destinationMatch?.groups?.["rest"];
  if (rest === undefined) {
    return undefined;
  }

  return {
    filter: filter.filter,
    min: cardinality.cardinality.min,
    max: cardinality.cardinality.max,
    revealTo: "bothPlayers",
    rest,
    evidence: [
      ...cardinality.evidence,
      ...filter.evidence,
      "destination:hand",
      "reveal:bothPlayers",
    ],
  };
}

export function parseAddUpToAnyCardToHand(
  input: ParseInput,
): RevealToHandParseResult | undefined {
  const actionMatch = /^add\s+(?<rest>.+)$/i.exec(input.text);
  const cardinalityText = actionMatch?.groups?.["rest"];
  if (cardinalityText === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: cardinalityText });
  if (cardinality === undefined) {
    return undefined;
  }

  const destinationMatch = /^card to your hand\.\s+(?<rest>.+)$/i.exec(
    cardinality.rest,
  );
  const rest = destinationMatch?.groups?.["rest"];
  if (rest === undefined) {
    return undefined;
  }

  return {
    filter: {},
    min: cardinality.cardinality.min,
    max: cardinality.cardinality.max,
    revealTo: "chooserOnly",
    rest,
    evidence: [
      ...cardinality.evidence,
      "filter:any",
      "destination:hand",
      "reveal:chooserOnly",
    ],
  };
}
