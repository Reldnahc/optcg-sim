import type { CardInstance, GameState, PlayerId } from "@optcg/types";

export type PlayCardOverflowSource = {
  sourceCard: CardInstance;
  sourceIndex: number;
  sourceZone: "hand" | "trash" | "noZone";
};

export const findPlayCardOverflowSource = (
  player: GameState["players"][PlayerId],
  instanceId: CardInstance["instanceId"],
): PlayCardOverflowSource | null => {
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === instanceId,
  );
  if (handIndex >= 0) {
    const sourceCard = player.hand[handIndex];
    return sourceCard === undefined
      ? null
      : { sourceCard, sourceIndex: handIndex, sourceZone: "hand" };
  }

  const trashIndex = player.trash.findIndex(
    (card) => card.instanceId === instanceId,
  );
  if (trashIndex >= 0) {
    const sourceCard = player.trash[trashIndex];
    return sourceCard === undefined
      ? null
      : { sourceCard, sourceIndex: trashIndex, sourceZone: "trash" };
  }

  return null;
};
