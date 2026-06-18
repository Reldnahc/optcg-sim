import type { CardCategory, CardFilter } from "@optcg/types";

import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { PrimitiveEvidence } from "../types.js";
import type { CostParseResult } from "./rest-don.js";

export const trashFromHandCostPrimitive: PrimitivePatternDefinition<CostParseResult> =
  {
    primitiveId: "cost:trashFromHand",
    matches: [
      {
        id: "trash-n-cards-from-your-hand",
        pattern: /^trash (?<count>[1-9]\d*) cards? from your hand$/i,
        build: (groups) => ({
          cost: {
            type: "trashFromHand",
            count: Number.parseInt(groups["count"] ?? "", 10),
            chooser: "self",
            optional: true,
          },
          evidence: [
            "cost:trashFromHand",
            "count:positiveInteger",
            "chooser:self",
          ],
          rest: "",
        }),
      },
    ],
  };

export const parseTrashFromHandCost = (
  input: Parameters<typeof parsePrimitivePattern<CostParseResult>>[0],
): CostParseResult | undefined =>
  parsePrimitivePattern(input, trashFromHandCostPrimitive) ??
  parseAnyNumberTrashFromHandCost(input) ??
  parseFilteredTrashFromHandCost(input);

const parseAnyNumberTrashFromHandCost = (
  input: Parameters<typeof parsePrimitivePattern<CostParseResult>>[0],
): CostParseResult | undefined => {
  const match = /^trash any number of (?<filter>.+?) from your hand$/i.exec(
    input.text,
  );
  const filterText = match?.groups?.["filter"];
  if (filterText === undefined) {
    return undefined;
  }

  const parsedFilter =
    parseCategoryListFilter(filterText.replace(/\s+cards?$/i, "")) ??
    parseGeneralTrashFromHandFilter(filterText);
  if (parsedFilter === undefined) {
    return undefined;
  }

  return {
    cost: {
      type: "trashFromHand",
      count: 0,
      maxCount: "available",
      chooser: "self",
      filter: parsedFilter.filter,
      optional: true,
    },
    evidence: [
      "cost:trashFromHand",
      "count:anyNumber",
      "chooser:self",
      ...parsedFilter.evidence,
    ],
    rest: "",
  };
};

const parseGeneralTrashFromHandFilter = (
  text: string,
):
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  const parsedFilter = [text, text.replace(/\s+cards?$/i, "")].reduce<
    ReturnType<typeof parseCardFilterPredicates> | undefined
  >(
    (parsed, candidate) =>
      parsed?.rest.length === 0
        ? parsed
        : parseCardFilterPredicates({ text: candidate }),
    undefined,
  );
  if (parsedFilter === undefined || parsedFilter.rest.length > 0) {
    return undefined;
  }
  return {
    filter: parsedFilter.filter,
    evidence: parsedFilter.evidence,
  };
};

const categoryByText = new Map<string, CardCategory>([
  ["characters", "character"],
  ["character", "character"],
  ["stages", "stage"],
  ["stage", "stage"],
  ["events", "event"],
  ["event", "event"],
]);

const parseCategoryListFilter = (
  text: string,
):
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  const categories = text
    .split(/\s+or\s+|,\s*/i)
    .map((part) => categoryByText.get(part.trim().toLowerCase()))
    .filter((category): category is CardCategory => category !== undefined);
  if (categories.length === 0) {
    return undefined;
  }
  if (new Set(categories).size !== categories.length) {
    return undefined;
  }

  return {
    filter: { categories },
    evidence: categories.map(categoryEvidence),
  };
};

const categoryEvidence = (category: CardCategory): PrimitiveEvidence => {
  switch (category) {
    case "character":
      return "filter:category:character";
    case "stage":
      return "filter:category:stage";
    case "event":
      return "filter:category:event";
    case "leader":
      return "filter:category:leader";
    case "don":
      return "filter:category:don";
  }
};

const parseFilteredTrashFromHandCost = (
  input: Parameters<typeof parsePrimitivePattern<CostParseResult>>[0],
): CostParseResult | undefined => {
  const match =
    /^trash (?<count>[1-9]\d*) (?<filter>.+?) from your hand$/i.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const filterText = match?.groups?.["filter"];
  if (countText === undefined || filterText === undefined) {
    return undefined;
  }

  const parsedFilter = [
    filterText,
    filterText.replace(/\s+cards?$/i, ""),
  ].reduce<ReturnType<typeof parseCardFilterPredicates> | undefined>(
    (parsed, candidate) =>
      parsed?.rest.length === 0
        ? parsed
        : parseCardFilterPredicates({ text: candidate }),
    undefined,
  );
  if (parsedFilter === undefined || parsedFilter.rest.length > 0) {
    return undefined;
  }

  return {
    cost: {
      type: "trashFromHand",
      count: Number.parseInt(countText, 10),
      chooser: "self",
      filter: parsedFilter.filter,
      optional: true,
    },
    evidence: [
      "cost:trashFromHand",
      "count:positiveInteger",
      "chooser:self",
      ...parsedFilter.evidence,
    ],
    rest: "",
  };
};
