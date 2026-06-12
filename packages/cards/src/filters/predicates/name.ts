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
