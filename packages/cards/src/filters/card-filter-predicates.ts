import type { CardColor, CardFilter, Comparator } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface CardFilterPredicateParseResult {
  readonly filter: CardFilter;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

type PredicateParser = (
  text: string,
  current: CardFilter,
) =>
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined;

const predicateParsers: readonly PredicateParser[] = [
  parseColorPredicate,
  parseTypeCharacterPredicate,
  parseGenericTypeCardPredicate,
  parseRestedCharacterPredicate,
  parseEventCategoryPredicate,
  parseCharacterCategoryPredicate,
  parsePowerPredicate,
  parseCostPredicate,
  parseNameExclusionPredicate,
  parseNamePredicate,
  parseDifferentNamesPredicate,
];

export function parseCardFilterPredicates(
  input: ParseInput,
): CardFilterPredicateParseResult | undefined {
  let rest = input.text.trim();
  let filter: CardFilter = {};
  const evidence: PrimitiveEvidence[] = [];
  let parsedAny = false;

  while (rest.length > 0) {
    const parsed = parseNextPredicate(rest, filter);

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

function parseNextPredicate(text: string, filter: CardFilter) {
  for (const parser of predicateParsers) {
    const parsed = parser(text, filter);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  const normalized = stripLeadingConnector(text);
  if (normalized === text) {
    return undefined;
  }

  for (const parser of predicateParsers) {
    const parsed = parser(normalized, filter);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function stripLeadingConnector(text: string): string {
  return text.replace(/^(?:with|and)\s+/i, "").trim();
}

function parseTypeCharacterPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match =
    /^(?<type>\{[^}]+\}) type (?<category>Character|Stage)(?: cards?|s)?\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const typeText = match?.groups?.["type"];
  const categoryText = match?.groups?.["category"];
  const restText = match?.groups?.["rest"];
  if (typeText === undefined || categoryText === undefined) {
    return undefined;
  }

  const typeName = /^\{(?<name>[^}]+)\}$/.exec(typeText)?.groups?.["name"];
  if (typeName === undefined || typeName.trim().length === 0) {
    return undefined;
  }

  return {
    filter: {
      ...current,
      categories: [categoryText.toLowerCase() as "character" | "stage"],
      typesAny: [typeName.trim()],
    },
    evidence: [
      "filter:type",
      categoryText.toLowerCase() === "character"
        ? "filter:category:character"
        : "filter:category:stage",
    ],
    rest: restText ?? "",
  };
}

function parseGenericTypeCardPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match = /^(?<type>\{[^}]+\}) type card\b\s*(?<rest>.*)$/i.exec(text);
  const typeText = match?.groups?.["type"];
  const restText = match?.groups?.["rest"];
  if (typeText === undefined) {
    return undefined;
  }

  const typeName = /^\{(?<name>[^}]+)\}$/.exec(typeText)?.groups?.["name"];
  if (typeName === undefined || typeName.trim().length === 0) {
    return undefined;
  }

  return {
    filter: { ...current, typesAny: [typeName.trim()] },
    evidence: ["filter:type"],
    rest: restText ?? "",
  };
}

function parseColorPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match =
    /^(?<color>red|green|blue|purple|black|yellow)\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const colorText = match?.groups?.["color"];
  const restText = match?.groups?.["rest"];
  if (colorText === undefined) {
    return undefined;
  }

  return {
    filter: {
      ...current,
      colorsAny: [colorText.toLowerCase() as CardColor],
    },
    evidence: ["filter:color"],
    rest: restText ?? "",
  };
}

function parseCharacterCategoryPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match = /^Characters?\b\s*(?<rest>.*)$/i.exec(text);
  if (match === null) {
    return undefined;
  }

  return {
    filter: { ...current, categories: ["character"] },
    evidence: ["filter:category:character"],
    rest: match.groups?.["rest"] ?? "",
  };
}

function parseEventCategoryPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match = /^Events?\b\s*(?<rest>.*)$/i.exec(text);
  if (match === null) {
    return undefined;
  }

  return {
    filter: { ...current, categories: ["event"] },
    evidence: ["filter:category:event"],
    rest: match.groups?.["rest"] ?? "",
  };
}

function parseRestedCharacterPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match = /^rested Characters?\b\s*(?<rest>.*)$/i.exec(text);
  if (match === null) {
    return undefined;
  }

  return {
    filter: { ...current, categories: ["character"], state: "rested" },
    evidence: ["filter:state:rested", "filter:category:character"],
    rest: match.groups?.["rest"] ?? "",
  };
}

function parsePowerPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match = /^(?<value>[1-9]\d*) power\b\s*(?<rest>.*)$/i.exec(text);
  const valueText = match?.groups?.["value"];
  const restText = match?.groups?.["rest"];
  if (valueText === undefined) {
    return undefined;
  }

  return {
    filter: {
      ...current,
      power: { op: "eq", value: Number.parseInt(valueText, 10) },
    },
    evidence: [
      "filter:power",
      "condition:comparator:eq",
      "condition:threshold:positiveInteger",
    ],
    rest: restText ?? "",
  };
}

function parseCostPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match =
    /^a cost of (?<value>[1-9]\d*) (?<direction>or more|or less)\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const valueText = match?.groups?.["value"];
  const direction = match?.groups?.["direction"];
  const restText = match?.groups?.["rest"];
  if (valueText === undefined || direction === undefined) {
    return undefined;
  }

  const op: Comparator = direction.toLowerCase() === "or more" ? "gte" : "lte";

  return {
    filter: {
      ...current,
      cost: { op, value: Number.parseInt(valueText, 10) },
    },
    evidence: [
      "filter:cost",
      op === "gte" ? "condition:comparator:gte" : "condition:comparator:lte",
      "condition:threshold:positiveInteger",
    ],
    rest: restText ?? "",
  };
}

function parseDifferentNamesPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match = /^different card names\b\s*(?<rest>.*)$/i.exec(text);
  const restText = match?.groups?.["rest"];
  if (match === null) {
    return undefined;
  }

  return {
    filter: { ...current, custom: "differentNames" },
    evidence: ["filter:differentNames"],
    rest: restText ?? "",
  };
}

function parseNameExclusionPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match = /^other than \[(?<name>[^\]]+)\]\s*(?<rest>.*)$/i.exec(text);
  const nameText = match?.groups?.["name"];
  const restText = match?.groups?.["rest"];
  if (nameText === undefined || nameText.trim().length === 0) {
    return undefined;
  }

  return {
    filter: { ...current, nameNot: [nameText.trim()] },
    evidence: ["filter:nameNot"],
    rest: restText ?? "",
  };
}

function parseNamePredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match = /^\[(?<name>[^\]]+)\]\s*(?<rest>.*)$/i.exec(text);
  const nameText = match?.groups?.["name"];
  const restText = match?.groups?.["rest"];
  if (nameText === undefined || nameText.trim().length === 0) {
    return undefined;
  }

  return {
    filter: { ...current, names: [nameText.trim()] },
    evidence: ["filter:name"],
    rest: restText ?? "",
  };
}
