import type { CardFilter } from "@optcg/types";

export const isSupportedAttachDonTargetFilter = (
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return false;
  }
  const categories = filter.categories;
  const categoryShape =
    categories !== undefined &&
    ((categories.length === 1 && categories[0] === "leader") ||
      (categories.length === 1 && categories[0] === "character") ||
      (categories.length === 2 &&
        categories[0] === "leader" &&
        categories[1] === "character"));
  const nameShape =
    filter.names !== undefined &&
    filter.names.length > 0 &&
    filter.names.every((name) => typeof name === "string" && name.length > 0);
  if (!categoryShape && !nameShape) {
    return false;
  }
  return isSupportedPublicFieldTargetFilter(filter);
};

const supportedPublicFieldTargetFilterKeys = new Set<keyof CardFilter>([
  "anyOf",
  "attachedDon",
  "attributesAny",
  "baseCost",
  "categories",
  "colorsAny",
  "cost",
  "currentPower",
  "effectEntryPoint",
  "excludeSelf",
  "nameNot",
  "names",
  "power",
  "state",
  "statComparisons",
  "typesAny",
  "typesIncludeAny",
  "typesNotIncludeAny",
]);

export const isSupportedPublicFieldTargetFilter = (
  filter: CardFilter | undefined,
): boolean =>
  filter === undefined ||
  (Object.keys(filter).every((key) =>
    supportedPublicFieldTargetFilterKeys.has(key as keyof CardFilter),
  ) &&
    (filter.anyOf === undefined ||
      (filter.anyOf.length > 0 &&
        filter.anyOf.every(isSupportedPublicFieldTargetFilter))));
