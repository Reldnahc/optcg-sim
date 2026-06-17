import type { PredicateParser } from "./types.js";

export const parseCardNameContainsPredicate: PredicateParser = (
  text,
  current,
) => {
  const match = /^card name includes\s+"(?<name>[^"]+)"\s*(?<rest>.*)$/i.exec(
    text,
  );
  const nameText = match?.groups?.["name"]?.trim();
  if (nameText === undefined || nameText.length === 0) {
    return undefined;
  }

  return {
    filter: { ...current, nameContains: nameText },
    evidence: ["filter:name"],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseSelfExclusionPredicate: PredicateParser = (text, current) => {
  const match = /^other than this (?:Character|card)\b\s*(?<rest>.*)$/i.exec(
    text,
  );
  if (match === null) {
    return undefined;
  }

  return {
    filter: { ...current, excludeSelf: true },
    evidence: ["filter:excludeSelf"],
    rest: match.groups?.["rest"] ?? "",
  };
};

export const parseNameExclusionPredicate: PredicateParser = (text, current) => {
  const match = /^other than \[(?<name>[^\]]+)\]\s*(?<rest>.*)$/i.exec(text);
  const nameText = match?.groups?.["name"]?.trim();
  if (nameText === undefined || nameText.length === 0) {
    return undefined;
  }

  return {
    filter: { ...current, nameNot: [nameText] },
    evidence: ["filter:nameNot"],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseNameCardPredicate: PredicateParser = (text, current) => {
  const match = /^\[(?<name>[^\]]+)\]\s+cards?\b\s*(?<rest>.*)$/i.exec(text);
  const nameText = match?.groups?.["name"]?.trim();
  if (nameText === undefined || nameText.length === 0) {
    return undefined;
  }

  return {
    filter: { ...current, names: [nameText] },
    evidence: ["filter:name"],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseNameListPredicate: PredicateParser = (text, current) => {
  const matches = [...text.matchAll(/\[(?<name>[^\]]+)\]/giu)];
  if (matches.length < 2 || matches[0]?.index !== 0) {
    return undefined;
  }

  const names: string[] = [];
  let previousEnd = 0;
  let consumedEnd = 0;
  for (const [index, match] of matches.entries()) {
    const nameText = match.groups?.["name"]?.trim();
    if (nameText === undefined || nameText.length === 0) {
      return undefined;
    }
    const matchIndex = match.index;
    if (index > 0) {
      const separator = text.slice(previousEnd, matchIndex);
      if (!/^\s*(?:,\s*)?(?:(?:or)\s+)?$/iu.test(separator)) {
        break;
      }
    }
    names.push(nameText);
    previousEnd = matchIndex + match[0].length;
    consumedEnd = previousEnd;
  }

  if (names.length < 2) {
    return undefined;
  }

  return {
    filter: {
      ...current,
      anyOf: names.map((name) => ({ names: [name] })),
    },
    evidence: ["filter:anyOf", ...names.map(() => "filter:name" as const)],
    rest: text.slice(consumedEnd).trim(),
  };
};

export const parseNamePredicate: PredicateParser = (text, current) => {
  const match = /^\[(?<name>[^\]]+)\]\s*(?<rest>.*)$/i.exec(text);
  const nameText = match?.groups?.["name"]?.trim();
  if (nameText === undefined || nameText.length === 0) {
    return undefined;
  }

  return {
    filter: { ...current, names: [nameText] },
    evidence: ["filter:name"],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseDifferentNamesPredicate: PredicateParser = (
  text,
  current,
) => {
  const match = /^different card names\b\s*(?<rest>.*)$/i.exec(text);
  if (match === null) {
    return undefined;
  }

  return {
    filter: { ...current, custom: "differentNames" },
    evidence: ["filter:differentNames"],
    rest: match.groups?.["rest"] ?? "",
  };
};
