import type {
  Attribute,
  CardCategory,
  CardColor,
  CardFilter,
  Comparator,
} from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface CardFilterPredicateParseResult {
  readonly filter: CardFilter;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

type PredicateParser = (
  text: string,
  current: CardFilter,
  options: CardFilterPredicateParseOptions,
) =>
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined;

export interface CardFilterPredicateParseOptions {
  readonly powerSemantics?: "printed" | "current";
}

const predicateParsers: readonly PredicateParser[] = [
  parseColorPredicate,
  parseTypeOrAttributeCategoryPredicate,
  parseTypeLeaderOrCharacterPredicate,
  parseTypeCharacterPredicate,
  parseGenericTypeCardPredicate,
  parseTypeOnlyPredicate,
  parseAttributeCategoryPredicate,
  parseRestedCharacterPredicate,
  parseEventCategoryPredicate,
  parseStageCategoryPredicate,
  parseCharacterCategoryPredicate,
  parsePowerPredicate,
  parseDynamicDonFieldCostPredicate,
  parseCostPredicate,
  parseNameExclusionPredicate,
  parseNamePredicate,
  parseDifferentNamesPredicate,
];

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
  let rest = text.trim();
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
  return text.replace(/^(?:with|and)\s+/i, "").trim();
}

function parseBraceName(text: string): string | undefined {
  const name = /^\{(?<name>[^}]+)\}$/.exec(text)?.groups?.["name"]?.trim();
  return name === undefined || name.length === 0 ? undefined : name;
}

function parseAngleAttribute(text: string): Attribute | undefined {
  const name = /^<(?<name>[^>]+)>$/.exec(text)?.groups?.["name"]?.trim();
  return name === undefined || name.length === 0
    ? undefined
    : (name.toLowerCase() as Attribute);
}

function categoryEvidence(category: string): PrimitiveEvidence {
  const normalized = category.toLowerCase();
  if (normalized === "character") {
    return "filter:category:character";
  }
  if (normalized === "stage") {
    return "filter:category:stage";
  }
  return "filter:category:event";
}

function parseTypeLeaderOrCharacterPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match =
    /^(?<type>\{[^}]+\}) type Leader or Character cards?\b\s*(?<rest>.*)$/i.exec(
      text,
    );
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
    filter: {
      ...current,
      categories: ["leader", "character"],
      typesAny: [typeName.trim()],
    },
    evidence: [
      "filter:type",
      "filter:category:leader",
      "filter:category:character",
    ],
    rest: restText ?? "",
  };
}

function parseTypeOrAttributeCategoryPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match =
    /^(?<type>\{[^}]+\}) type or (?<attribute><[^>]+>) attribute (?<category>Character|Stage|Event)(?: cards?|s)?\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const typeText = match?.groups?.["type"];
  const attributeText = match?.groups?.["attribute"];
  const categoryText = match?.groups?.["category"];
  const restText = match?.groups?.["rest"];
  if (
    typeText === undefined ||
    attributeText === undefined ||
    categoryText === undefined
  ) {
    return undefined;
  }

  const typeName = parseBraceName(typeText);
  const attribute = parseAngleAttribute(attributeText);
  if (typeName === undefined || attribute === undefined) {
    return undefined;
  }

  return {
    filter: {
      ...current,
      anyOf: [{ typesAny: [typeName] }, { attributesAny: [attribute] }],
      categories: [categoryText.toLowerCase() as CardCategory],
    },
    evidence: [
      "filter:anyOf",
      "filter:type",
      "filter:attribute",
      categoryEvidence(categoryText),
    ],
    rest: restText ?? "",
  };
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

  const typeName = parseBraceName(typeText);
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

  const typeName = parseBraceName(typeText);
  if (typeName === undefined || typeName.trim().length === 0) {
    return undefined;
  }

  return {
    filter: { ...current, typesAny: [typeName.trim()] },
    evidence: ["filter:type"],
    rest: restText ?? "",
  };
}

function parseTypeOnlyPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match = /^(?<type>\{[^}]+\}) type\b\s*(?<rest>.*)$/i.exec(text);
  const typeText = match?.groups?.["type"];
  const restText = match?.groups?.["rest"];
  if (typeText === undefined) {
    return undefined;
  }

  const typeName = parseBraceName(typeText);
  if (typeName === undefined || typeName.trim().length === 0) {
    return undefined;
  }

  return {
    filter: { ...current, typesAny: [typeName.trim()] },
    evidence: ["filter:type"],
    rest: restText ?? "",
  };
}

function parseAttributeCategoryPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match =
    /^(?<attribute><[^>]+>) attribute (?<category>Character|Stage|Event)(?: cards?|s)?\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const attributeText = match?.groups?.["attribute"];
  const categoryText = match?.groups?.["category"];
  const restText = match?.groups?.["rest"];
  if (attributeText === undefined || categoryText === undefined) {
    return undefined;
  }

  const attribute = parseAngleAttribute(attributeText);
  if (attribute === undefined) {
    return undefined;
  }

  return {
    filter: {
      ...current,
      attributesAny: [attribute],
      categories: [categoryText.toLowerCase() as CardCategory],
    },
    evidence: ["filter:attribute", categoryEvidence(categoryText)],
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
  const match = /^Characters?(?: cards?)?\b\s*(?<rest>.*)$/i.exec(text);
  if (match === null) {
    return undefined;
  }

  return {
    filter: { ...current, categories: ["character"] },
    evidence: ["filter:category:character"],
    rest: match.groups?.["rest"] ?? "",
  };
}

function parseStageCategoryPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match = /^Stages?\b\s*(?<rest>.*)$/i.exec(text);
  if (match === null) {
    return undefined;
  }

  return {
    filter: { ...current, categories: ["stage"] },
    evidence: ["filter:category:stage"],
    rest: match.groups?.["rest"] ?? "",
  };
}

function parseEventCategoryPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match = /^Events?(?: cards?)?\b\s*(?<rest>.*)$/i.exec(text);
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
  options: CardFilterPredicateParseOptions,
): ReturnType<PredicateParser> {
  const thresholdMatch =
    /^(?<value>0|[1-9]\d*) (?<base>base )?power (?<direction>or more|or less)\b\s*(?<thresholdRest>.*)$/i.exec(
      text,
    );
  const thresholdValueText = thresholdMatch?.groups?.["value"];
  const isBasePower = thresholdMatch?.groups?.["base"] !== undefined;
  const direction = thresholdMatch?.groups?.["direction"];
  if (thresholdValueText !== undefined && direction !== undefined) {
    const op: Comparator =
      direction.toLowerCase() === "or more" ? "gte" : "lte";
    const powerFilter =
      op === "gte"
        ? { min: Number.parseInt(thresholdValueText, 10) }
        : { max: Number.parseInt(thresholdValueText, 10) };
    const useCurrentPower =
      !isBasePower && options.powerSemantics === "current";
    const thresholdEvidence: PrimitiveEvidence =
      thresholdValueText === "0"
        ? "condition:threshold:nonNegativeInteger"
        : "condition:threshold:positiveInteger";
    return {
      filter: {
        ...current,
        ...(useCurrentPower
          ? { currentPower: powerFilter }
          : { power: powerFilter }),
      },
      evidence: [
        useCurrentPower ? "filter:currentPower" : "filter:power",
        op === "gte" ? "condition:comparator:gte" : "condition:comparator:lte",
        thresholdEvidence,
      ],
      rest: thresholdMatch?.groups?.["thresholdRest"] ?? "",
    };
  }

  const match =
    /^(?<value>0|[1-9]\d*) (?<base>base )?power\b\s*(?<rest>.*)$/i.exec(text);
  const valueText = match?.groups?.["value"];
  const isExactBasePower = match?.groups?.["base"] !== undefined;
  const restText = match?.groups?.["rest"];
  if (valueText === undefined) {
    return undefined;
  }
  const thresholdEvidence: PrimitiveEvidence =
    valueText === "0"
      ? "condition:threshold:nonNegativeInteger"
      : "condition:threshold:positiveInteger";
  const useCurrentPower =
    !isExactBasePower && options.powerSemantics === "current";

  return {
    filter: {
      ...current,
      ...(useCurrentPower
        ? {
            currentPower: {
              op: "eq",
              value: Number.parseInt(valueText, 10),
            },
          }
        : {
            power: {
              op: "eq",
              value: Number.parseInt(valueText, 10),
            },
          }),
    },
    evidence: [
      useCurrentPower ? "filter:currentPower" : "filter:power",
      "condition:comparator:eq",
      thresholdEvidence,
    ],
    rest: restText ?? "",
  };
}

function parseCostPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const exactMatch =
    /^a (?:base )?cost of (?<exact>[1-9]\d*)\b(?!\s+or\s+(?:more|less)\b)\s*(?<exactRest>.*)$/i.exec(
      text,
    );
  const exactValueText = exactMatch?.groups?.["exact"];
  if (exactValueText !== undefined) {
    return {
      filter: {
        ...current,
        cost: { op: "eq", value: Number.parseInt(exactValueText, 10) },
      },
      evidence: [
        "filter:cost",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
      ],
      rest: exactMatch?.groups?.["exactRest"] ?? "",
    };
  }

  const match =
    /^a (?:base )?cost of (?<value>[1-9]\d*) (?<direction>or more|or less)\b\s*(?<rest>.*)$/i.exec(
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
      cost:
        op === "gte"
          ? { min: Number.parseInt(valueText, 10) }
          : { max: Number.parseInt(valueText, 10) },
    },
    evidence: [
      "filter:cost",
      op === "gte" ? "condition:comparator:gte" : "condition:comparator:lte",
      "condition:threshold:positiveInteger",
    ],
    rest: restText ?? "",
  };
}

function parseDynamicDonFieldCostPredicate(
  text: string,
  current: CardFilter,
): ReturnType<PredicateParser> {
  const match =
    /^a cost equal to or less than the number of DON!! cards on your field\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  if (match === null) {
    return undefined;
  }

  return {
    filter: { ...current, custom: "costLteSelfDonFieldCount" },
    evidence: [
      "filter:cost",
      "condition:comparator:lte",
      "valueSource:donFieldCount:self",
    ],
    rest: match.groups?.["rest"] ?? "",
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
