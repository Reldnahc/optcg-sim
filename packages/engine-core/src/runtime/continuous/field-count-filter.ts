import type { CardFilter, CardInstance, GameState } from "@optcg/types";

import {
  cardMatchesAnyAttribute,
  cardMatchesAnyName,
  cardMatchesAnyType,
  cardMatchesAnyTypeIncludes,
} from "../../card-name-matching.js";

const supportedDynamicFieldCountFilterKeys = new Set<keyof CardFilter>([
  "anyOf",
  "attributesAny",
  "attributesNotAny",
  "categories",
  "custom",
  "names",
  "typesAny",
  "typesIncludeAny",
]);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const isSupportedDynamicFieldCountFilter = (
  filter: CardFilter,
): boolean =>
  Object.keys(filter).every((key) =>
    supportedDynamicFieldCountFilterKeys.has(key as keyof CardFilter),
  ) &&
  (filter.anyOf === undefined ||
    (filter.anyOf.length > 0 &&
      filter.anyOf.every(isSupportedDynamicFieldCountFilter))) &&
  (filter.attributesAny === undefined || isStringArray(filter.attributesAny)) &&
  (filter.attributesNotAny === undefined ||
    isStringArray(filter.attributesNotAny)) &&
  (filter.categories === undefined || isStringArray(filter.categories)) &&
  (filter.custom === undefined || filter.custom === "differentNames") &&
  (filter.names === undefined || isStringArray(filter.names)) &&
  (filter.typesAny === undefined || isStringArray(filter.typesAny)) &&
  (filter.typesIncludeAny === undefined ||
    isStringArray(filter.typesIncludeAny));

export const cardMatchesDynamicFieldCountFilter = (
  state: GameState,
  card: CardInstance,
  filter: CardFilter,
): boolean => {
  const metadata = state.cardManifest.cards[card.cardId];
  if (metadata === undefined || !isSupportedDynamicFieldCountFilter(filter)) {
    return false;
  }
  if (
    filter.anyOf !== undefined &&
    !filter.anyOf.some((child) =>
      cardMatchesDynamicFieldCountFilter(state, card, child),
    )
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
    filter.names !== undefined &&
    !cardMatchesAnyName(metadata, filter.names)
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
    filter.attributesAny !== undefined &&
    !cardMatchesAnyAttribute(metadata, filter.attributesAny)
  ) {
    return false;
  }
  if (filter.custom !== undefined && filter.custom !== "differentNames") {
    return false;
  }
  return !(
    filter.attributesNotAny !== undefined &&
    cardMatchesAnyAttribute(metadata, filter.attributesNotAny)
  );
};
