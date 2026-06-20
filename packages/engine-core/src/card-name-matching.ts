import type { ResolvedCard } from "@optcg/types";

type NamedCard = Pick<ResolvedCard, "name"> & {
  readonly nameAliases?: readonly string[];
  readonly identityTreatment?: {
    readonly includes: readonly string[];
  };
};

type TypedCard = Pick<ResolvedCard, "types"> & {
  readonly identityTreatment?: {
    readonly includes: readonly string[];
  };
};

type AttributedCard = {
  readonly attributes: readonly string[];
  readonly identityTreatment?: {
    readonly includes: readonly string[];
  };
};

const namesForCard = (card: NamedCard): readonly string[] => [
  card.name,
  ...(card.nameAliases ?? []),
];

const cardIsTreatedAsAllNames = (card: NamedCard): boolean =>
  card.identityTreatment?.includes.includes("names") === true;

const cardIsTreatedAsAllTypes = (card: TypedCard): boolean =>
  card.identityTreatment?.includes.includes("types") === true;

const cardIsTreatedAsAllAttributes = (card: AttributedCard): boolean =>
  card.identityTreatment?.includes.includes("attributes") === true;

export const cardMatchesAnyName = (
  card: NamedCard,
  names: readonly string[],
): boolean =>
  (names.length > 0 && cardIsTreatedAsAllNames(card)) ||
  names.some((name) => namesForCard(card).includes(name));

export const cardMatchesNameContains = (
  card: NamedCard,
  nameFragment: string,
): boolean =>
  (nameFragment.length > 0 && cardIsTreatedAsAllNames(card)) ||
  namesForCard(card).some((name) => name.includes(nameFragment));

export const cardMatchesAnyType = (
  card: TypedCard,
  types: readonly string[],
): boolean =>
  (types.length > 0 && cardIsTreatedAsAllTypes(card)) ||
  types.some((type) => card.types.includes(type));

export const cardMatchesAnyTypeIncludes = (
  card: TypedCard,
  typeTexts: readonly string[],
): boolean =>
  (typeTexts.length > 0 && cardIsTreatedAsAllTypes(card)) ||
  typeTexts.some((typeText) =>
    card.types.some((type) => type.includes(typeText)),
  );

export const cardMatchesAnyAttribute = (
  card: AttributedCard,
  attributes: readonly string[],
): boolean =>
  (attributes.length > 0 && cardIsTreatedAsAllAttributes(card)) ||
  attributes.some((attribute) => card.attributes.includes(attribute));
