import type { ClientCardModel } from "../view-model.js";

export const reconcileContinuousHandOrder = ({
  currentHandIds,
  previousHandIds,
  rememberedOrder,
}: {
  readonly currentHandIds: readonly string[];
  readonly previousHandIds: readonly string[] | undefined;
  readonly rememberedOrder: readonly string[];
}): string[] => {
  const currentIds = new Set(currentHandIds);
  const previousIds =
    previousHandIds === undefined ? currentIds : new Set(previousHandIds);
  return rememberedOrder.filter(
    (instanceId) => currentIds.has(instanceId) && previousIds.has(instanceId),
  );
};

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
