import type { CardInstance, CardRef, GameState, PlayerId } from "@optcg/types";

import { failure } from "./errors.js";
import type { LocatedCard, LocatedReplacementSource } from "./types.js";

export const findCardByInstanceId = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): LocatedCard | null => {
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    if (player.leader.instanceId === instanceId) {
      return { playerId, zone: "leaderArea", card: player.leader };
    }

    const collections = [
      ["characterArea", player.characters],
      ["stageArea", player.stage === undefined ? [] : [player.stage]],
      ["hand", player.hand],
      ["deck", player.deck],
      ["trash", player.trash],
      ["costArea", player.costArea],
      ["donDeck", player.donDeck],
      ["life", player.life.map((lifeCard) => lifeCard.card)],
    ] as const;

    for (const [zone, cards] of collections) {
      const card = cards.find(
        (candidate) => candidate.instanceId === instanceId,
      );
      if (card !== undefined) return { playerId, zone, card };
    }
  }
  return null;
};

export const toPublicFieldCardRef = (
  card: CardInstance,
  playerId: PlayerId,
): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

export const replacementSourcesForController = (
  state: GameState,
  playerId: PlayerId,
  effectId: string,
):
  | { ok: true; sources: LocatedReplacementSource[] }
  | ReturnType<typeof failure> => {
  const player = state.players[playerId];
  if (player === undefined) {
    return failure(effectId, "missing-card");
  }
  const cards = [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
  ];
  const sources: LocatedReplacementSource[] = [];
  for (const card of cards) {
    const resolved = state.cardManifest.cards[card.cardId];
    if (resolved === undefined) {
      continue;
    }
    if (
      resolved.support.status === "vanilla-confirmed" &&
      resolved.support.effectDefinitionId === undefined
    ) {
      continue;
    }
    sources.push({
      card,
      playerId,
      ref: toPublicFieldCardRef(card, playerId),
      resolved,
    });
  }
  return { ok: true, sources };
};
