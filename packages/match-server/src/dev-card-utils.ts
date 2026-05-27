import type { CardId, CardInstance, GameState, PlayerId } from "@optcg/types";

export const allPlayerCards = (
  player: GameState["players"][PlayerId],
): CardInstance[] => [
  player.leader,
  ...player.deck,
  ...player.hand,
  ...player.trash,
  ...player.characters,
  ...player.costArea,
  ...player.donDeck,
  ...player.life.map((lifeCard) => lifeCard.card),
  ...(player.stage === undefined ? [] : [player.stage]),
];

export const cardName = (state: GameState, cardId: CardId): string =>
  state.cardManifest.cards[cardId]?.name ?? String(cardId);

export const cardByInstanceId = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): CardInstance | undefined => {
  for (const player of Object.values(state.players)) {
    const card = allPlayerCards(player).find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (card !== undefined) {
      return card;
    }
  }
  return undefined;
};
