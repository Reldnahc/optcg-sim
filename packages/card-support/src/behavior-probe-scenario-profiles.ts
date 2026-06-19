import type {
  Attribute,
  CardCategory,
  CardColor,
  CardFilter,
  CardId,
  Keyword,
} from "@optcg/types";

export interface ProbeCardProfile {
  readonly cardId?: CardId;
  readonly name?: string;
  readonly category?: CardCategory;
  readonly colors?: readonly CardColor[];
  readonly attributes?: readonly Attribute[];
  readonly types?: readonly string[];
  readonly cost?: number;
  readonly power?: number;
  readonly counter?: number;
  readonly keywords?: readonly Keyword[];
}

export const profileForLeaderFilters = (
  filters: readonly CardFilter[],
): ProbeCardProfile => {
  if (filters.length === 0) {
    return { category: "leader" };
  }
  const profiles = filters.map((filter, index) =>
    profileForCardFilter(filter, index),
  );
  const firstName = profiles[0]?.name;
  return {
    category: "leader",
    ...(firstName === undefined ? {} : { name: firstName }),
    colors: uniqueProfileValues(profiles.flatMap((profile) => profile.colors)),
    attributes: uniqueProfileValues(
      profiles.flatMap((profile) => profile.attributes),
    ),
    types: uniqueProfileValues(profiles.flatMap((profile) => profile.types)),
    keywords: uniqueProfileValues(
      profiles.flatMap((profile) => profile.keywords),
    ),
  };
};

export const profileForCardFilter = (
  filter: CardFilter,
  index: number,
): ProbeCardProfile => {
  const effectiveFilter = filter.anyOf?.[0] ?? filter;
  const category = effectiveFilter.categories?.[0] ?? "character";
  const cardId = effectiveFilter.cardIds?.[0];
  const cost = numberForPredicate(
    effectiveFilter.cost ?? effectiveFilter.baseCost,
  );
  const power = numberForPredicate(
    effectiveFilter.power ?? effectiveFilter.currentPower,
  );
  const counter = numberForPredicate(effectiveFilter.counter);
  return {
    ...(cardId === undefined ? {} : { cardId }),
    name:
      effectiveFilter.names?.[0] ??
      (effectiveFilter.nameContains === undefined
        ? `Probe Match ${String(index + 1)}`
        : `Probe ${effectiveFilter.nameContains} Match`),
    category,
    colors: colorsForFilter(effectiveFilter),
    attributes: attributesForFilter(effectiveFilter),
    types: typesForFilter(effectiveFilter),
    ...(cost === undefined ? {} : { cost }),
    ...(power === undefined ? {} : { power }),
    ...(counter === undefined ? {} : { counter }),
    keywords: effectiveFilter.hasKeywords ?? [],
  };
};

const colorsForFilter = (filter: CardFilter): readonly CardColor[] => {
  if (filter.colorsAll !== undefined && filter.colorsAll.length > 0) {
    return filter.colorsAll;
  }
  if (filter.colorsAny !== undefined && filter.colorsAny.length > 0) {
    return [filter.colorsAny[0] as CardColor];
  }
  return ["red"];
};

const attributesForFilter = (filter: CardFilter): readonly Attribute[] => {
  if (filter.attributesAll !== undefined && filter.attributesAll.length > 0) {
    return filter.attributesAll;
  }
  if (filter.attributesAny !== undefined && filter.attributesAny.length > 0) {
    return [filter.attributesAny[0] as Attribute];
  }
  return [];
};

const typesForFilter = (filter: CardFilter): readonly string[] =>
  [
    ...(filter.typesAll ?? []),
    ...(filter.typesAny === undefined ? [] : [filter.typesAny[0] ?? ""]),
    ...(filter.typesIncludeAny === undefined
      ? []
      : [filter.typesIncludeAny[0] ?? ""]),
  ].filter((type) => type.length > 0);

const uniqueProfileValues = <T>(
  values: readonly (T | undefined)[],
): readonly T[] => [
  ...new Set(values.filter((value): value is T => value !== undefined)),
];

const numberForPredicate = (
  predicate:
    | { readonly op: string; readonly value: number }
    | { readonly min?: number; readonly max?: number }
    | undefined,
): number | undefined => {
  if (predicate === undefined) {
    return undefined;
  }
  if ("value" in predicate) {
    switch (predicate.op) {
      case "lt":
        return Math.max(0, predicate.value - 1);
      case "lte":
        return predicate.value;
      case "gt":
        return predicate.value + 1;
      case "gte":
      case "eq":
      default:
        return predicate.value;
    }
  }
  return predicate.min ?? predicate.max;
};
