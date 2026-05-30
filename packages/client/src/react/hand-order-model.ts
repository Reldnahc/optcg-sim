import type { ClientCardModel } from "../view-model.js";

export const orderCardsByInstanceIds = (
  cards: readonly ClientCardModel[],
  order: readonly string[] = [],
): ClientCardModel[] => {
  const cardsById = new Map(
    cards.map((card) => [String(card.instanceId), card]),
  );
  const orderedCards = order.flatMap((instanceId) => {
    const card = cardsById.get(instanceId);
    return card === undefined ? [] : [card];
  });
  const orderedIds = new Set(
    orderedCards.map((card) => String(card.instanceId)),
  );
  return [
    ...orderedCards,
    ...cards.filter((card) => !orderedIds.has(String(card.instanceId))),
  ];
};
