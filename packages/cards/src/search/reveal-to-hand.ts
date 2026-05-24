import type { CardFilter } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";
import { parseTypeCardFilter } from "./type-card-filter.js";

export interface SearchSelectionVerbParseResult {
  readonly revealTo: "bothPlayers" | "chooserOnly";
  readonly rest: string;
  readonly evidence: readonly PrimitiveEvidence[];
}

export interface SearchFilterParseResult {
  readonly filter: CardFilter;
  readonly rest: string;
  readonly evidence: readonly PrimitiveEvidence[];
}

export interface SearchSelectionToHandParseResult {
  readonly filter: CardFilter;
  readonly min: number;
  readonly max: number;
  readonly revealTo: "bothPlayers" | "chooserOnly";
  readonly rest: string;
  readonly evidence: readonly PrimitiveEvidence[];
}

export function parseSearchSelectionVerb(
  input: ParseInput,
): SearchSelectionVerbParseResult | undefined {
  const revealMatch = /^reveal\s+(?<rest>.+)$/i.exec(input.text);
  const revealRest = revealMatch?.groups?.["rest"];
  if (revealRest !== undefined) {
    return {
      revealTo: "bothPlayers",
      rest: revealRest,
      evidence: ["reveal:bothPlayers"],
    };
  }

  const addMatch = /^add\s+(?<rest>.+)$/i.exec(input.text);
  const addRest = addMatch?.groups?.["rest"];
  if (addRest !== undefined) {
    return {
      revealTo: "chooserOnly",
      rest: addRest,
      evidence: ["reveal:chooserOnly"],
    };
  }

  return undefined;
}

export function parseSearchAnyCardFilter(
  input: ParseInput,
): SearchFilterParseResult | undefined {
  const match = /^card(?<rest>.*)$/i.exec(input.text);
  const rest = match?.groups?.["rest"];
  if (rest === undefined) {
    return undefined;
  }

  return {
    filter: {},
    rest,
    evidence: ["filter:any"],
  };
}

export function parseSearchCardFilter(
  input: ParseInput,
): SearchFilterParseResult | undefined {
  return parseTypeCardFilter(input) ?? parseSearchAnyCardFilter(input);
}

export function parseSearchSelectionToHand(
  input: ParseInput,
): SearchSelectionToHandParseResult | undefined {
  const verb = parseSearchSelectionVerb(input);
  if (verb === undefined) {
    return undefined;
  }

  const cardinality = parseUpToCardinality({ text: verb.rest });
  if (cardinality === undefined) {
    return undefined;
  }

  const filter = parseSearchCardFilter({ text: cardinality.rest });
  if (filter === undefined) {
    return undefined;
  }

  const destinationMatch =
    /^(?: and add it to your hand| to your hand)\.\s+(?<rest>.+)$/i.exec(
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
    revealTo: verb.revealTo,
    rest,
    evidence: [
      ...verb.evidence,
      ...cardinality.evidence,
      ...filter.evidence,
      "destination:hand",
    ],
  };
}
