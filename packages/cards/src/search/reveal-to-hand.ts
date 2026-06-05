import type { CardFilter } from "@optcg/types";

import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

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
  const predicateMatch = /^card\s+with\s+(?<predicate>.+)$/i.exec(input.text);
  const predicateText = predicateMatch?.groups?.["predicate"];
  if (predicateText !== undefined) {
    const predicates = parseCardFilterPredicates({ text: predicateText });
    if (predicates !== undefined) {
      return predicates;
    }
  }

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
  return parseCardFilterPredicates(input) ?? parseSearchAnyCardFilter(input);
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

  const repeatedUpToOne = parseRepeatedUpToOneSearchSelection({
    text: cardinality.rest,
  });
  if (
    repeatedUpToOne !== undefined &&
    cardinality.cardinality.min === 0 &&
    cardinality.cardinality.max === 1
  ) {
    return {
      filter: repeatedUpToOne.filter,
      min: cardinality.cardinality.min,
      max: cardinality.cardinality.max,
      revealTo: verb.revealTo,
      rest: repeatedUpToOne.rest,
      evidence: [
        ...verb.evidence,
        ...cardinality.evidence,
        ...repeatedUpToOne.evidence,
        "destination:hand",
      ],
    };
  }

  const filter = parseSearchCardFilter({ text: cardinality.rest });
  if (filter === undefined) {
    return undefined;
  }

  const destinationMatch =
    /^\s*(?:and add it to your hand|to your hand)\.\s+(?<rest>.+)$/i.exec(
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

const parseRepeatedUpToOneSearchSelection = (
  input: ParseInput,
): SearchFilterParseResult | undefined => {
  const match =
    /^(?<left>.+?)\s+or\s+up to 1\s+(?<right>.+?)\s+and add it to your hand\.\s+(?<rest>.+)$/i.exec(
      input.text,
    );
  const leftText = match?.groups?.["left"];
  const rightText = match?.groups?.["right"];
  const rest = match?.groups?.["rest"];
  if (leftText === undefined || rightText === undefined || rest === undefined) {
    return undefined;
  }

  const parseBranch = (text: string) =>
    parseCardFilterPredicates({ text: text.replace(/^card\s+/i, "") });
  const left = parseBranch(leftText);
  const right = parseBranch(rightText);
  if (
    left === undefined ||
    right === undefined ||
    left.rest.length > 0 ||
    right.rest.length > 0
  ) {
    return undefined;
  }

  return {
    filter: { anyOf: [left.filter, right.filter] },
    rest,
    evidence: ["filter:anyOf", ...left.evidence, ...right.evidence],
  };
};
