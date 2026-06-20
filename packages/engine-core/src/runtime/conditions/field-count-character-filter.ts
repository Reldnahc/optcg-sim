import type {
  CardFilter,
  CardInstance,
  Comparator,
  ResolvedCard,
} from "@optcg/types";

import {
  cardMatchesAnyName,
  cardMatchesAnyAttribute,
  cardMatchesAnyType,
  cardMatchesAnyTypeIncludes,
  cardMatchesNameContains,
} from "../../card-name-matching.js";

type NumericFilter =
  | { op: Comparator; value: number }
  | { min?: number; max?: number };

export type CharacterFieldCountFilter = Required<
  Pick<CardFilter, "categories">
> & {
  anyOf?: CardFilter[];
  state?: "active" | "rested";
  colorsAny?: NonNullable<CardFilter["colorsAny"]>;
  attributesAny?: NonNullable<CardFilter["attributesAny"]>;
  attributesNotAny?: NonNullable<CardFilter["attributesNotAny"]>;
  names?: string[];
  nameNot?: string[];
  typesAny?: string[];
  typesIncludeAny?: string[];
  attachedDon?: NumericFilter;
  baseCost?: NumericFilter;
  cost?: NumericFilter;
  power?: NumericFilter;
  currentPower?: NumericFilter;
  excludeSelf?: boolean;
  custom?: "differentNames";
};

export const isSupportedCharacterFieldCountFilter = (
  filter: CardFilter | undefined,
): filter is CharacterFieldCountFilter => {
  return isSupportedCharacterFieldCountFilterShape(filter, {
    categoryMode: "character",
  });
};

export const isSupportedLeaderOrCharacterFieldCountFilter = (
  filter: CardFilter | undefined,
): filter is CharacterFieldCountFilter => {
  return (
    isLeaderOrCharacterCategoryFilter(filter) &&
    isSupportedCharacterFieldCountFilterShape(filter, {
      categoryMode: "leaderOrCharacter",
    })
  );
};

const isSupportedCharacterFieldCountFilterShape = (
  filter: CardFilter | undefined,
  options: { readonly categoryMode: "character" | "leaderOrCharacter" | "any" },
): filter is CharacterFieldCountFilter => {
  if (filter === undefined) {
    return false;
  }
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  for (const key of keys) {
    if (
      key !== "anyOf" &&
      key !== "categories" &&
      key !== "state" &&
      key !== "colorsAny" &&
      key !== "attributesAny" &&
      key !== "attributesNotAny" &&
      key !== "names" &&
      key !== "nameNot" &&
      key !== "typesAny" &&
      key !== "typesIncludeAny" &&
      key !== "attachedDon" &&
      key !== "baseCost" &&
      key !== "cost" &&
      key !== "power" &&
      key !== "currentPower" &&
      key !== "excludeSelf" &&
      key !== "custom"
    ) {
      return false;
    }
  }
  if (!hasSupportedCategoryFilter(filter, options.categoryMode)) {
    return false;
  }
  return (
    (filter.anyOf === undefined ||
      (filter.anyOf.length > 0 &&
        filter.anyOf.every((child) =>
          isSupportedCharacterFieldCountFilterShape(child, {
            categoryMode: "any",
          }),
        ))) &&
    isSupportedFieldState(filter.state) &&
    isNonEmptyStringArray(filter.colorsAny) &&
    isNonEmptyStringArray(filter.attributesAny) &&
    isNonEmptyStringArray(filter.attributesNotAny) &&
    isNonEmptyStringArray(filter.names) &&
    isNonEmptyStringArray(filter.nameNot) &&
    isNonEmptyStringArray(filter.typesAny) &&
    isNonEmptyStringArray(filter.typesIncludeAny) &&
    hasSupportedNumericFilter(filter.attachedDon) &&
    hasSupportedNumericFilter(filter.cost) &&
    hasSupportedNumericFilter(filter.baseCost) &&
    hasSupportedNumericFilter(filter.power) &&
    hasSupportedNumericFilter(filter.currentPower) &&
    (filter.excludeSelf === undefined || filter.excludeSelf) &&
    (filter.custom === undefined || filter.custom === "differentNames")
  );
};

export const cardMatchesCharacterFieldCountFilter = (
  metadata: ResolvedCard,
  card: CardInstance,
  filter: CardFilter,
): boolean => {
  if (
    filter.attachedDon !== undefined &&
    !numericFilterMatches(card.attachedDon.length, filter.attachedDon)
  ) {
    return false;
  }
  if (
    filter.categories !== undefined &&
    !filter.categories.includes(metadata.category)
  ) {
    return false;
  }
  if (
    filter.anyOf !== undefined &&
    !filter.anyOf.some((child) =>
      cardMatchesCharacterFieldCountFilter(metadata, card, child),
    )
  ) {
    return false;
  }
  if (
    filter.colorsAny !== undefined &&
    !filter.colorsAny.some((colorName) => metadata.colors.includes(colorName))
  ) {
    return false;
  }
  if (
    filter.attributesAny !== undefined &&
    !cardMatchesAnyAttribute(metadata, filter.attributesAny)
  ) {
    return false;
  }
  if (
    filter.attributesNotAny !== undefined &&
    cardMatchesAnyAttribute(metadata, filter.attributesNotAny)
  ) {
    return false;
  }
  if (
    filter.typesAny !== undefined &&
    !cardMatchesAnyType(metadata, filter.typesAny)
  ) {
    return false;
  }
  if (
    filter.typesIncludeAny !== undefined &&
    !cardMatchesAnyTypeIncludes(metadata, filter.typesIncludeAny)
  ) {
    return false;
  }
  if (
    filter.names !== undefined &&
    !cardMatchesAnyName(metadata, filter.names)
  ) {
    return false;
  }
  if (
    filter.nameNot !== undefined &&
    cardMatchesAnyName(metadata, filter.nameNot)
  ) {
    return false;
  }
  if (
    filter.nameContains !== undefined &&
    !cardMatchesNameContains(metadata, filter.nameContains)
  ) {
    return false;
  }
  if (
    filter.baseCost !== undefined &&
    !numericFilterMatches(metadata.cost, filter.baseCost)
  ) {
    return false;
  }
  if (
    filter.cost !== undefined &&
    !numericFilterMatches(metadata.cost, filter.cost)
  ) {
    return false;
  }
  if (
    filter.power !== undefined &&
    !numericFilterMatches(metadata.power, filter.power)
  ) {
    return false;
  }
  if (
    filter.currentPower !== undefined &&
    !numericFilterMatches(
      metadata.power === undefined
        ? undefined
        : metadata.power + card.attachedDon.length * 1000,
      filter.currentPower,
    )
  ) {
    return false;
  }
  return true;
};

const isSupportedFieldState = (
  value: CardFilter["state"] | undefined,
): boolean => value === undefined || value === "active" || value === "rested";

const isCharacterCategoryFilter = (filter: CardFilter): boolean =>
  Array.isArray(filter.categories) &&
  filter.categories.length === 1 &&
  filter.categories[0] === "character";

const hasSupportedCategoryFilter = (
  filter: CardFilter,
  categoryMode: "character" | "leaderOrCharacter" | "any",
): boolean => {
  if (categoryMode === "character") {
    return isCharacterCategoryFilter(filter);
  }
  if (filter.categories === undefined) {
    return true;
  }
  if (isCharacterCategoryFilter(filter)) {
    return true;
  }
  return (
    categoryMode === "leaderOrCharacter" &&
    isLeaderOrCharacterCategoryFilter(filter)
  );
};

const isLeaderOrCharacterCategoryFilter = (
  filter: CardFilter | undefined,
): filter is CardFilter =>
  filter !== undefined &&
  Array.isArray(filter.categories) &&
  filter.categories.length === 2 &&
  filter.categories.includes("leader") &&
  filter.categories.includes("character");

const isNonEmptyStringArray = (value: unknown): boolean =>
  value === undefined ||
  (Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === "string"));

const hasSupportedNumericFilter = (
  filter: NumericFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if ("op" in filter) {
    return isComparator(filter.op) && Number.isFinite(filter.value);
  }
  return (
    (filter.min === undefined || Number.isFinite(filter.min)) &&
    (filter.max === undefined || Number.isFinite(filter.max)) &&
    (filter.min === undefined ||
      filter.max === undefined ||
      filter.min <= filter.max)
  );
};

const numericFilterMatches = (
  value: number | undefined,
  filter: NumericFilter,
): boolean => {
  if (value === undefined) {
    return false;
  }
  if ("op" in filter) {
    return compare(filter.op, value, filter.value);
  }
  if (filter.min !== undefined && value < filter.min) {
    return false;
  }
  if (filter.max !== undefined && value > filter.max) {
    return false;
  }
  return true;
};

const compare = (op: Comparator, left: number, right: number): boolean => {
  switch (op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    default: {
      const exhaustive: never = op;
      return exhaustive;
    }
  }
};

const isComparator = (value: unknown): value is Comparator => {
  switch (value) {
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return true;
    default:
      return false;
  }
};
