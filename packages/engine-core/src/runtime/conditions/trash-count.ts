import type {
  CardFilter,
  GameState,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { cardMatchesAnyName } from "../../card-name-matching.js";

export const isSupportedTrashCountFilter = (filter: CardFilter): boolean => {
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return (
    keys.every((key) => key === "categories" || key === "names") &&
    (filter.categories === undefined ||
      (Array.isArray(filter.categories) &&
        filter.categories.length > 0 &&
        filter.categories.every(
          (category) =>
            category === "character" ||
            category === "event" ||
            category === "stage" ||
            category === "leader",
        ))) &&
    (filter.names === undefined ||
      (Array.isArray(filter.names) &&
        filter.names.length > 0 &&
        filter.names.every((name) => typeof name === "string"))) &&
    (filter.categories !== undefined || filter.names !== undefined)
  );
};

const cardMatchesTrashCountFilter = (
  filter: CardFilter,
  metadata: ResolvedCard,
): boolean => {
  const categoryMatches =
    filter.categories === undefined ||
    filter.categories.includes(metadata.category);
  const nameMatches =
    filter.names === undefined || cardMatchesAnyName(metadata, filter.names);

  return categoryMatches && nameMatches;
};

export const countTrashCardsMatchingFilter = (
  state: GameState,
  playerId: PlayerId,
  filter: CardFilter,
): number => {
  const player = state.players[playerId];
  if (player === undefined) {
    return 0;
  }
  return player.trash.filter((card) => {
    const metadata = state.cardManifest.cards[card.cardId];
    return (
      metadata !== undefined && cardMatchesTrashCountFilter(filter, metadata)
    );
  }).length;
};
