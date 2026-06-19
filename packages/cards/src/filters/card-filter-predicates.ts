import type { CardFilter } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";
import { predicateParsers } from "./predicates/registry.js";
import type {
  CardFilterPredicateParseOptions,
  CardFilterPredicateParseResult,
} from "./predicates/types.js";

export type {
  CardFilterPredicateParseOptions,
  CardFilterPredicateParseResult,
} from "./predicates/types.js";

export function parseCardFilterPredicates(
  input: ParseInput,
  options: CardFilterPredicateParseOptions = {},
): CardFilterPredicateParseResult | undefined {
  const first = parseConjunctiveCardFilterPredicates(input.text, options);
  if (first === undefined) {
    return undefined;
  }

  const filters: CardFilter[] = [first.filter];
  const evidence: PrimitiveEvidence[] = [...first.evidence];
  let rest = first.rest.trim();

  while (rest.length > 0) {
    const orMatch = /^or\s+(?<right>.+)$/i.exec(rest);
    const rightText = orMatch?.groups?.["right"];
    if (rightText === undefined) {
      break;
    }

    const right = parseConjunctiveCardFilterPredicates(rightText, options);
    if (right === undefined) {
      break;
    }

    filters.push(right.filter);
    evidence.push(...right.evidence);
    rest = right.rest.trim();
  }

  if (filters.length === 1) {
    return first;
  }

  return {
    filter: { anyOf: filters },
    evidence: ["filter:anyOf", ...evidence],
    rest,
  };
}

function parseConjunctiveCardFilterPredicates(
  text: string,
  options: CardFilterPredicateParseOptions,
): CardFilterPredicateParseResult | undefined {
  let rest = stripLeadingArticle(text.trim());
  let filter: CardFilter = {};
  const evidence: PrimitiveEvidence[] = [];
  let parsedAny = false;

  while (rest.length > 0) {
    const parsed = parseNextPredicate(rest, filter, options);

    if (parsed === undefined) {
      break;
    }

    parsedAny = true;
    filter = parsed.filter;
    evidence.push(...parsed.evidence);
    rest = parsed.rest.trim();
  }

  return parsedAny ? { filter, evidence, rest } : undefined;
}

function parseNextPredicate(
  text: string,
  filter: CardFilter,
  options: CardFilterPredicateParseOptions,
) {
  for (const parser of predicateParsers) {
    const parsed = parser(text, filter, options);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  const normalized = stripLeadingConnector(text);
  if (normalized === text) {
    return undefined;
  }

  for (const parser of predicateParsers) {
    const parsed = parser(normalized, filter, options);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function stripLeadingConnector(text: string): string {
  return text.replace(/^(?:,?\s*(?:with|and)\s+)+/i, "").trim();
}

function stripLeadingArticle(text: string): string {
  return text.replace(/^(?:an?|the)\s+/iu, "").trim();
}
