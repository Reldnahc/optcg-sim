import type { CardRef, InstanceId } from "@optcg/types";

import type { ActionLogCardMention } from "../action-log.js";
import type { MatchCardCatalog } from "../transport.js";
import type { ClientCardModel } from "../view-model.js";

const catalogEntryForCard = (
  catalog: MatchCardCatalog | undefined,
  card: CardRef,
) => {
  const playerCatalog = catalog?.players[card.playerId];
  return (
    playerCatalog?.instances?.[card.instanceId] ??
    playerCatalog?.cards[card.cardId]
  );
};

export const cardDisplayFromCatalog = (
  catalog: MatchCardCatalog | undefined,
  card: CardRef,
): { name: string; imageUrl?: string } => {
  const catalogEntry = catalogEntryForCard(catalog, card);
  if (catalogEntry === undefined) {
    return { name: String(card.cardId) };
  }
  return {
    name: catalogEntry.name,
    ...(catalogEntry.imageUrl === undefined
      ? {}
      : { imageUrl: catalogEntry.imageUrl }),
  };
};

export const cardModelFromCatalog = (
  catalog: MatchCardCatalog | undefined,
  card: CardRef,
): ClientCardModel => {
  const catalogEntry = catalogEntryForCard(catalog, card);
  return {
    instanceId: card.instanceId,
    cardId: card.cardId,
    name: catalogEntry?.name ?? String(card.cardId),
    category: catalogEntry?.category ?? "unknown",
    ...(catalogEntry?.effectText === undefined
      ? {}
      : { effectText: catalogEntry.effectText }),
    ...(catalogEntry?.triggerText === undefined
      ? {}
      : { triggerText: catalogEntry.triggerText }),
    ...(catalogEntry?.effectTextSourceMap === undefined
      ? {}
      : { effectTextSourceMap: catalogEntry.effectTextSourceMap }),
    ...(catalogEntry?.triggerTextSourceMap === undefined
      ? {}
      : { triggerTextSourceMap: catalogEntry.triggerTextSourceMap }),
    ...(catalogEntry?.imageUrl === undefined
      ? {}
      : { imageUrl: catalogEntry.imageUrl }),
    attachedDonCount: 0,
    attachedDonCards: [],
  };
};

export const actionLogCardModel = (
  card: ActionLogCardMention["card"],
): ClientCardModel => ({
  instanceId:
    card.instanceId ??
    (`action-log:${card.playerId}:${card.cardId}` as InstanceId),
  cardId: card.cardId,
  name: card.name,
  category: card.category,
  ...(card.effectText === undefined ? {} : { effectText: card.effectText }),
  ...(card.triggerText === undefined ? {} : { triggerText: card.triggerText }),
  ...(card.imageUrl === undefined ? {} : { imageUrl: card.imageUrl }),
  attachedDonCount: 0,
  attachedDonCards: [],
});
