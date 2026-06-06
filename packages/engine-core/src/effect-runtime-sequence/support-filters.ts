import type { CardFilter } from "@optcg/types";

export const isSupportedAttachDonTargetFilter = (
  filter: CardFilter | undefined,
): boolean => {
  const categories = filter?.categories;
  if (categories === undefined) {
    return false;
  }
  const categoryShape =
    (categories.length === 1 && categories[0] === "leader") ||
    (categories.length === 1 && categories[0] === "character") ||
    (categories.length === 2 &&
      categories[0] === "leader" &&
      categories[1] === "character");
  if (!categoryShape) {
    return false;
  }
  if (filter === undefined) {
    return false;
  }
  return Object.keys(filter).every(
    (key) => key === "categories" || key === "typesAny",
  );
};

const supportedPublicFieldTargetFilterKeys = new Set<keyof CardFilter>([
  "anyOf",
  "categories",
  "colorsAny",
  "cost",
  "currentPower",
  "effectEntryPoint",
  "nameNot",
  "power",
  "state",
  "typesAny",
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
