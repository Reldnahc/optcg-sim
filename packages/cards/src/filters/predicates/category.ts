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
  const match = /^Stages?\b\s*(?<rest>.*)$/i.exec(text);
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

const categoryResult = (
  current: CardFilter,
  category: "character" | "stage" | "event",
  rest: string,
) => ({
  filter: { ...current, categories: [category] },
  evidence: [`filter:category:${category}`] as const,
  rest,
});

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
