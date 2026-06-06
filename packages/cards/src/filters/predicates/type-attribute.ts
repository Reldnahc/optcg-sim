import type { CardCategory } from "@optcg/types";

import {
  categoryEvidence,
  parseAngleAttribute,
  parseBraceName,
  type PredicateParser,
} from "./types.js";

export const parseTypeLeaderOrCharacterPredicate: PredicateParser = (
  text,
  current,
) => {
  const match =
    /^(?<type>\{[^}]+\}) type Leader or Character cards?\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const typeText = match?.groups?.["type"];
  const restText = match?.groups?.["rest"];
  if (typeText === undefined) {
    return undefined;
  }

  const typeName = parseBraceName(typeText);
  if (typeName === undefined) {
    return undefined;
  }

  return {
    filter: {
      ...current,
      categories: ["leader", "character"],
      typesAny: [typeName],
    },
    evidence: [
      "filter:type",
      "filter:category:leader",
      "filter:category:character",
    ],
    rest: restText ?? "",
  };
};

export const parseMultiTypeLeaderOrCharacterPredicate: PredicateParser = (
  text,
  current,
) => {
  const match =
    /^(?<types>\{[^}]+\}(?:\s+or\s+\{[^}]+\})+)\s+type\s+Leader or Character cards?\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const typeNames = parseBraceNameList(match?.groups?.["types"]);
  if (typeNames.length < 2) {
    return undefined;
  }

  return {
    filter: {
      ...current,
      categories: ["leader", "character"],
      typesAny: [...typeNames],
    },
    evidence: [
      ...typeNames.map(() => "filter:type" as const),
      "filter:category:leader",
      "filter:category:character",
    ],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseTypeOrAttributeCategoryPredicate: PredicateParser = (
  text,
  current,
) => {
  const match =
    /^(?<type>\{[^}]+\}) type or (?<attribute><[^>]+>) attribute (?<category>Character|Stage|Event)(?: cards?|s)?\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const typeText = match?.groups?.["type"];
  const attributeText = match?.groups?.["attribute"];
  const categoryText = match?.groups?.["category"];
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
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseTypeCharacterPredicate: PredicateParser = (text, current) => {
  const match =
    /^(?<type>\{[^}]+\}) type (?<category>Character|Stage)(?: cards?|s)?\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const typeText = match?.groups?.["type"];
  const categoryText = match?.groups?.["category"];
  if (typeText === undefined || categoryText === undefined) {
    return undefined;
  }

  const typeName = parseBraceName(typeText);
  if (typeName === undefined) {
    return undefined;
  }

  const category = categoryText.toLowerCase() as "character" | "stage";
  return {
    filter: {
      ...current,
      categories: [category],
      typesAny: [typeName],
    },
    evidence: [
      "filter:type",
      category === "character"
        ? "filter:category:character"
        : "filter:category:stage",
    ],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseGenericTypeCardPredicate: PredicateParser = (
  text,
  current,
) => {
  const match = /^(?<type>\{[^}]+\}) type card\b\s*(?<rest>.*)$/i.exec(text);
  const typeName = parseBraceName(match?.groups?.["type"] ?? "");
  if (typeName === undefined) {
    return undefined;
  }

  return {
    filter: { ...current, typesAny: [typeName] },
    evidence: ["filter:type"],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseQuotedTypeIncludingPredicate: PredicateParser = (
  text,
  current,
) => {
  const match = /^a type including\s+"(?<type>[^"]+)"\s*(?<rest>.*)$/i.exec(
    text,
  );
  const typeText = match?.groups?.["type"]?.trim();
  if (typeText === undefined || typeText.length === 0) {
    return undefined;
  }

  return {
    filter: { ...current, typesAny: [typeText] },
    evidence: ["filter:type"],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseTypeOnlyPredicate: PredicateParser = (text, current) => {
  const match = /^(?<type>\{[^}]+\}) type\b\s*(?<rest>.*)$/i.exec(text);
  const typeName = parseBraceName(match?.groups?.["type"] ?? "");
  if (typeName === undefined) {
    return undefined;
  }

  return {
    filter: { ...current, typesAny: [typeName] },
    evidence: ["filter:type"],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseAttributeCategoryPredicate: PredicateParser = (
  text,
  current,
) => {
  const match =
    /^(?<attribute><[^>]+>) attribute (?<category>Character|Stage|Event)(?: cards?|s)?\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const attributeText = match?.groups?.["attribute"];
  const categoryText = match?.groups?.["category"];
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
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseAttributeCardPredicate: PredicateParser = (text, current) => {
  const match = /^(?<attribute><[^>]+>) attribute card\b\s*(?<rest>.*)$/i.exec(
    text,
  );
  const attribute = parseAngleAttribute(match?.groups?.["attribute"] ?? "");
  if (attribute === undefined) {
    return undefined;
  }

  return {
    filter: { ...current, attributesAny: [attribute] },
    evidence: ["filter:attribute"],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseAttributeOnlyPredicate: PredicateParser = (text, current) => {
  const match = /^(?<attribute><[^>]+>) attribute\b\s*(?<rest>.*)$/i.exec(text);
  const attribute = parseAngleAttribute(match?.groups?.["attribute"] ?? "");
  if (attribute === undefined) {
    return undefined;
  }

  return {
    filter: { ...current, attributesAny: [attribute] },
    evidence: ["filter:attribute"],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseMultiTypeCategoryPredicate: PredicateParser = (
  text,
  current,
) => {
  const match =
    /^(?<types>\{[^}]+\}(?:\s+or\s+\{[^}]+\})+)\s+type\s+(?<category>Character|Stage|Event)(?: cards?|s)?\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const categoryText = match?.groups?.["category"];
  const typeNames = parseBraceNameList(match?.groups?.["types"]);
  if (typeNames.length < 2 || categoryText === undefined) {
    return undefined;
  }

  return {
    filter: {
      ...current,
      categories: [categoryText.toLowerCase() as CardCategory],
      typesAny: [...typeNames],
    },
    evidence: [
      ...typeNames.map(() => "filter:type" as const),
      categoryEvidence(categoryText),
    ],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseMultiTypeCardPredicate: PredicateParser = (text, current) => {
  const match =
    /^(?<types>\{[^}]+\}(?:\s+or\s+\{[^}]+\})+)\s+type\s+card\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const typeNames = parseBraceNameList(match?.groups?.["types"]);
  if (typeNames.length < 2) {
    return undefined;
  }

  return {
    filter: { ...current, typesAny: [...typeNames] },
    evidence: typeNames.map(() => "filter:type" as const),
    rest: match?.groups?.["rest"] ?? "",
  };
};

const parseBraceNameList = (text: string | undefined): string[] =>
  text === undefined
    ? []
    : text
        .split(/\s+or\s+/i)
        .map(parseBraceName)
        .filter((name): name is string => name !== undefined);
