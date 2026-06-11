import type { CardFilter, GameState, PlayerId } from "@optcg/types";

export const isSupportedTrashCountFilter = (filter: CardFilter): boolean => {
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return (
    keys.every((key) => key === "categories") &&
    Array.isArray(filter.categories) &&
    filter.categories.length > 0 &&
    filter.categories.every(
      (category) =>
        category === "character" ||
        category === "event" ||
        category === "stage" ||
        category === "leader",
    )
  );
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
      metadata !== undefined &&
      filter.categories !== undefined &&
      filter.categories.includes(metadata.category)
    );
  }).length;
};
