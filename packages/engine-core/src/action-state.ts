import type {
  CardInstance,
  CardRef,
  GameState,
  PlayerId,
  PlayerState,
} from "@optcg/types";

export type LocatedCombatCard = {
  card: CardInstance;
  playerId: PlayerId;
  isLeader: boolean;
};

export const isMatchActive = (state: GameState): boolean =>
  state.status.type === "active";

export const canConcede = (state: GameState): boolean =>
  state.status.type !== "completed" && state.status.type !== "gameOver";

export const getOpponentId = (
  state: GameState,
  playerId: PlayerId,
): PlayerId | null => {
  const playerIds = Object.keys(state.players) as PlayerId[];
  return playerIds.find((candidate) => candidate !== playerId) ?? null;
};

export const toCardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

export const zonesEqual = (
  left: NonNullable<CardRef["zone"]>,
  right: CardRef["zone"],
): boolean =>
  right !== undefined &&
  left.zone === right.zone &&
  left.playerId === right.playerId &&
  left.index === right.index &&
  left.slot === right.slot;

export const targetMatchesCard = (
  target: CardRef,
  card: CardInstance,
): boolean =>
  target.cardId === card.cardId &&
  (target.zone === undefined || zonesEqual(target.zone, card.zone));

export const getCombatCardByInstanceId = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): LocatedCombatCard | null => {
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    PlayerState,
  ][]) {
    if (player.leader.instanceId === instanceId) {
      return { card: player.leader, playerId, isLeader: true };
    }
    const character = player.characters.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (character !== undefined) {
      return { card: character, playerId, isLeader: false };
    }
  }
  return null;
};

export const reifyCardRef = (
  state: GameState,
  ref: CardRef,
): LocatedCombatCard | null => {
  const located = getCombatCardByInstanceId(state, ref.instanceId);
  if (located === null) {
    return null;
  }
  if (
    ref.playerId !== located.playerId ||
    !targetMatchesCard(ref, located.card)
  ) {
    return null;
  }
  return located;
};

export const reindexZoneCards = (
  cards: CardInstance[],
  zone: CardInstance["zone"]["zone"],
  playerId: PlayerId,
  slot: NonNullable<CardInstance["zone"]["slot"]>,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone, playerId, slot, index },
  }));
