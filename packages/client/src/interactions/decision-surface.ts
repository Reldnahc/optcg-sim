import type { PlayerId } from "@optcg/types";

import type { DecisionModalModel } from "./decision-modal.js";

export interface CollectionDecisionSurface {
  kind: "collection";
  title: string;
  zone: "trash";
  playerId: PlayerId;
  model: Extract<DecisionModalModel, { kind: "selectCards" }>;
}

export const createCollectionDecisionSurface = (
  model: DecisionModalModel | undefined,
  currentPlayerId: PlayerId | undefined,
): CollectionDecisionSurface | undefined => {
  if (model?.kind !== "selectCards") {
    return undefined;
  }

  const firstChoice = model.cards[0];
  const firstZone = firstChoice?.card.zone;
  const playerId = firstZone?.playerId ?? firstChoice?.card.playerId;
  if (
    firstChoice === undefined ||
    currentPlayerId === undefined ||
    playerId === undefined ||
    firstZone?.zone !== "trash" ||
    model.cards.some((choice) => {
      const zone = choice.card.zone;
      return (
        zone?.zone !== "trash" ||
        (zone.playerId ?? choice.card.playerId) !== playerId
      );
    })
  ) {
    return undefined;
  }

  return {
    kind: "collection",
    title: playerId === currentPlayerId ? "Player trash" : "Opponent trash",
    zone: "trash",
    playerId,
    model,
  };
};
