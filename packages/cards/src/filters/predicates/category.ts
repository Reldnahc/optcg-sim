import type { CardColor, CardFilter } from "@optcg/types";

import type { PredicateParser } from "./types.js";
import type { CardFilterPredicateParseResult } from "./types.js";

export const parseColorPredicate: PredicateParser = (text, current) => {
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
};

export const parseCharacterCategoryPredicate: PredicateParser = (
  text,
  current,
) => {
  const match = /^Characters?(?: cards?)?\b\s*(?<rest>.*)$/i.exec(text);
  if (match === null) {
    return undefined;
  }

  return categoryResult(current, "character", match.groups?.["rest"] ?? "");
};

export const parseStageCategoryPredicate: PredicateParser = (text, current) => {
  const match = /^Stages?(?: cards?)?\b\s*(?<rest>.*)$/i.exec(text);
  if (match === null) {
    return undefined;
  }

  return categoryResult(current, "stage", match.groups?.["rest"] ?? "");
};

export const parseEventCategoryPredicate: PredicateParser = (text, current) => {
  const match = /^Events?(?: cards?)?\b\s*(?<rest>.*)$/i.exec(text);
  if (match === null) {
    return undefined;
  }

  return categoryResult(current, "event", match.groups?.["rest"] ?? "");
};

export const parseGenericCardPredicate: PredicateParser = (text, current) => {
  const match = /^cards?\b\s*(?<rest>.*)$/i.exec(text);
  if (match === null) {
    return undefined;
  }
  const rest = match.groups?.["rest"] ?? "";

  return {
    filter: current,
    evidence: startsAdditionalFilterPredicate(rest) ? [] : ["filter:any"],
    rest,
  };
};

export const parseRestedCharacterPredicate: PredicateParser = (
  text,
  current,
) => {
  return parseFieldStateCharacterPredicate(text, current, "rested");
};

export const parseActiveCharacterPredicate: PredicateParser = (
  text,
  current,
) => {
  return parseFieldStateCharacterPredicate(text, current, "active");
};

export const parseFieldStatePredicate: PredicateParser = (text, current) => {
  const match = /^(?:is\s+)?(?<state>active|rested)\b\s*(?<rest>.*)$/iu.exec(
    text,
  );
  const state = match?.groups?.["state"]?.toLowerCase();
  if (state !== "active" && state !== "rested") {
    return undefined;
  }

  return {
    filter: { ...current, state },
    evidence: [`filter:state:${state}`],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseFieldStateNamePredicate: PredicateParser = (
  text,
  current,
) => {
  const match =
    /^(?<state>active|rested)\s+\[(?<name>[^\]]+)\]\s*(?<rest>.*)$/iu.exec(
      text,
    );
  const state = match?.groups?.["state"]?.toLowerCase();
  const name = match?.groups?.["name"]?.trim();
  const rest = match?.groups?.["rest"] ?? "";
  if (
    (state !== "active" && state !== "rested") ||
    name === undefined ||
    name.length === 0
  ) {
    return undefined;
  }

  return {
    filter: { ...current, categories: ["character"], names: [name], state },
    evidence: [
      `filter:state:${state}`,
      "filter:category:character",
      "filter:name",
    ],
    rest,
  };
};

const categoryResult = (
  current: CardFilter,
  category: "character" | "stage" | "event",
  rest: string,
) => ({
  filter: { ...current, categories: [category] },
  evidence: [`filter:category:${category}`] as const,
  rest,
});

const startsAdditionalFilterPredicate = (rest: string): boolean =>
  /^(?:,?\s*(?:with|and)\b|other than\b)/i.test(rest.trim());

const parseFieldStateCharacterPredicate = (
  text: string,
  current: CardFilter,
  state: "active" | "rested",
): CardFilterPredicateParseResult | undefined => {
  const match = new RegExp(
    `^${state} Characters?\\b\\s*(?<rest>.*)$`,
    "i",
  ).exec(text);
  if (match === null) {
    return undefined;
  }

  return {
    filter: { ...current, categories: ["character"], state },
    evidence: [`filter:state:${state}`, "filter:category:character"],
    rest: match.groups?.["rest"] ?? "",
  };
};
