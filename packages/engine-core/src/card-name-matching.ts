import type { ResolvedCard } from "@optcg/types";

type NamedCard = Pick<ResolvedCard, "name"> & {
  readonly nameAliases?: readonly string[];
};

const namesForCard = (card: NamedCard): readonly string[] => [
  card.name,
  ...(card.nameAliases ?? []),
];

export const cardMatchesAnyName = (
  card: NamedCard,
  names: readonly string[],
): boolean => names.some((name) => namesForCard(card).includes(name));

export const cardMatchesNameContains = (
  card: NamedCard,
  nameFragment: string,
): boolean => namesForCard(card).some((name) => name.includes(nameFragment));
