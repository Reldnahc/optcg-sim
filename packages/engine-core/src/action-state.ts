import type {
  CardInstance,
  CardFilter,
  CardRef,
  GameState,
  PlayerId,
  PlayerState,
  ResolvedCard,
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

const supportedSearchFilterKeys = new Set([
  "categories",
  "colorsAny",
  "typesAny",
  "nameNot",
]);
const supportedHandSelectionFilterKeys = new Set([
  ...supportedSearchFilterKeys,
  "custom",
]);

const supportedHandSelectionCustomFilters = new Set([
  "costLteSelfDonFieldCount",
]);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const isSupportedSearchCardFilter = (filter: CardFilter): boolean => {
  for (const key of Object.keys(filter)) {
    if (!supportedSearchFilterKeys.has(key)) return false;
  }
  return (
    (filter.categories === undefined || isStringArray(filter.categories)) &&
    (filter.colorsAny === undefined || isStringArray(filter.colorsAny)) &&
    (filter.typesAny === undefined || isStringArray(filter.typesAny)) &&
    (filter.nameNot === undefined || isStringArray(filter.nameNot))
  );
};

export const isSupportedHandSelectionCardFilter = (
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  for (const key of Object.keys(filter)) {
    if (!supportedHandSelectionFilterKeys.has(key)) return false;
  }
  return (
    (filter.categories === undefined || isStringArray(filter.categories)) &&
    (filter.colorsAny === undefined || isStringArray(filter.colorsAny)) &&
    (filter.typesAny === undefined || isStringArray(filter.typesAny)) &&
    (filter.nameNot === undefined || isStringArray(filter.nameNot)) &&
    (filter.custom === undefined ||
      supportedHandSelectionCustomFilters.has(filter.custom))
  );
};

const cardMatchesBaseFilter = (
  card: ResolvedCard | undefined,
  filter: CardFilter,
): boolean => {
  if (card === undefined) return false;
  if (
    filter.categories !== undefined &&
    !filter.categories.includes(card.category)
  ) {
    return false;
  }
  if (
    filter.colorsAny !== undefined &&
    !filter.colorsAny.some((color) => card.colors.includes(color))
  ) {
    return false;
  }
  if (
    filter.typesAny !== undefined &&
    !filter.typesAny.some((type) => card.types.includes(type))
  ) {
    return false;
  }
  return !(filter.nameNot !== undefined && filter.nameNot.includes(card.name));
};

export const cardMatchesSearchFilter = (
  card: ResolvedCard | undefined,
  filter: CardFilter,
): boolean => cardMatchesBaseFilter(card, filter);

export const cardMatchesHandSelectionFilter = (
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  const resolved = state.cardManifest.cards[card.cardId];
  if (!cardMatchesBaseFilter(resolved, filter)) {
    return false;
  }
  if (filter.custom === "costLteSelfDonFieldCount") {
    const cost = resolved?.cost;
    const donFieldCount = state.players[playerId]?.costArea.length ?? 0;
    return cost !== undefined && cost <= donFieldCount;
  }
  return filter.custom === undefined;
};
