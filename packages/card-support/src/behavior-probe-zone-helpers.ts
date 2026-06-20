import { reindexZoneCards } from "@optcg/engine-core";
import type { CardId, CardInstance, GameState, PlayerId } from "@optcg/types";

import { resolvedProbeCard } from "./behavior-probe-resolved-card.js";

export const reindexHand = (
  cards: readonly CardInstance[],
  playerId: PlayerId,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: {
      zone: "hand",
      playerId,
      slot: "hand",
      index,
    },
  }));

export const addProbeDeckCards = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  const cardIdPrefix = `probe-extra-${String(playerId)}-`;
  const startIndex = Object.keys(state.cardManifest.cards).filter((cardId) =>
    cardId.startsWith(cardIdPrefix),
  ).length;
  const cards = Array.from({ length: count }, (_, index): CardInstance => {
    const cardId = `${cardIdPrefix}${String(startIndex + index)}` as CardId;
    state.cardManifest.cards[cardId] = resolvedProbeCard({
      cardId,
      category: "character",
      effectText: "",
    });
    return {
      instanceId:
        `${cardIdPrefix}${String(startIndex + index)}:instance` as CardInstance["instanceId"],
      cardId,
      owner: playerId,
      controller: playerId,
      zone: {
        zone: "deck",
        playerId,
        slot: "deck",
        index: player.deck.length + index,
      },
      state: "active",
      attachedDon: [],
      turnPlayed: 0,
    };
  });
  player.deck = [...player.deck, ...cards];
};

export const ensureProbePlayerDeckCount = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  if (player.deck.length >= count) {
    return;
  }
  addProbeDeckCards(state, playerId, count - player.deck.length);
};

export const ensureProbePlayerHandCount = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  if (player.hand.length >= count) {
    return;
  }
  const needed = count - player.hand.length;
  ensureProbePlayerDeckCount(state, playerId, needed);
  const moved = player.deck.slice(0, needed).map((card, index) => ({
    ...card,
    zone: {
      zone: "hand" as const,
      playerId,
      slot: "hand" as const,
      index: player.hand.length + index,
    },
  }));
  player.hand = reindexHand([...player.hand, ...moved], playerId);
  player.deck = reindexZoneCards(
    player.deck.slice(needed),
    "deck",
    playerId,
    "deck",
  );
};

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
