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

export const addCardsToHand = (
  hand: readonly CardInstance[],
  cards: readonly CardInstance[],
  playerId: PlayerId,
): CardInstance[] =>
  reindexZoneCards([...hand, ...cards], "hand", playerId, "hand");

export const reorderDeckSlice = (params: {
  readonly deck: readonly CardInstance[];
  readonly destination: "top" | "bottom";
  readonly orderedSlice: readonly CardInstance[];
  readonly playerId: PlayerId;
  readonly sliceCount: number;
}): CardInstance[] => {
  const tail = params.deck.slice(params.sliceCount);
  return reindexZoneCards(
    params.destination === "top"
      ? [...params.orderedSlice, ...tail]
      : [...tail, ...params.orderedSlice],
    "deck",
    params.playerId,
    "deck",
  );
};

const supportedSearchFilterKeys = new Set([
  "anyOf",
  "attributesAny",
  "categories",
  "colorsAny",
  "cost",
  "names",
  "typesAny",
  "nameNot",
]);
const supportedHandSelectionFilterKeys = new Set([
  "anyOf",
  "attributesAny",
  "categories",
  "colorsAny",
  "custom",
  "cost",
  "names",
  "nameNot",
  "power",
  "state",
  "typesAny",
]);
const supportedHandSelectionStates = new Set(["active", "rested", "attached"]);

const supportedHandSelectionCustomFilters = new Set([
  "costLteSelfDonFieldCount",
  "differentNames",
]);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isSupportedNumericFilter = (
  value:
    | CardFilter["cost"]
    | CardFilter["power"]
    | CardFilter["currentPower"]
    | undefined,
): boolean => {
  if (value === undefined) {
    return true;
  }
  if ("op" in value) {
    return Number.isInteger(value.value);
  }
  return (
    (value.min === undefined || Number.isInteger(value.min)) &&
    (value.max === undefined || Number.isInteger(value.max))
  );
};

export const isSupportedSearchCardFilter = (filter: CardFilter): boolean => {
  for (const key of Object.keys(filter)) {
    if (!supportedSearchFilterKeys.has(key)) return false;
  }
  return (
    (filter.anyOf === undefined ||
      (filter.anyOf.length > 0 &&
        filter.anyOf.every(isSupportedSearchCardFilter))) &&
    (filter.attributesAny === undefined ||
      isStringArray(filter.attributesAny)) &&
    (filter.categories === undefined || isStringArray(filter.categories)) &&
    (filter.colorsAny === undefined || isStringArray(filter.colorsAny)) &&
    isSupportedNumericFilter(filter.cost) &&
    (filter.names === undefined || isStringArray(filter.names)) &&
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
    (filter.anyOf === undefined ||
      (filter.anyOf.length > 0 &&
        filter.anyOf.every(isSupportedHandSelectionCardFilter))) &&
    (filter.attributesAny === undefined ||
      isStringArray(filter.attributesAny)) &&
    (filter.categories === undefined || isStringArray(filter.categories)) &&
    (filter.colorsAny === undefined || isStringArray(filter.colorsAny)) &&
    (filter.names === undefined || isStringArray(filter.names)) &&
    (filter.typesAny === undefined || isStringArray(filter.typesAny)) &&
    (filter.nameNot === undefined || isStringArray(filter.nameNot)) &&
    (filter.state === undefined ||
      supportedHandSelectionStates.has(filter.state)) &&
    isSupportedNumericFilter(filter.cost) &&
    isSupportedNumericFilter(filter.power) &&
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
    filter.anyOf !== undefined &&
    !filter.anyOf.some((candidate) => cardMatchesBaseFilter(card, candidate))
  ) {
    return false;
  }
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
  if (
    filter.attributesAny !== undefined &&
    !filter.attributesAny.some((attribute) =>
      card.attributes.includes(attribute),
    )
  ) {
    return false;
  }
  if (filter.names !== undefined && !filter.names.includes(card.name)) {
    return false;
  }
  if (filter.cost !== undefined) {
    const cost = card.cost;
    if (cost === undefined) {
      return false;
    }
    if ("op" in filter.cost) {
      if (filter.cost.op === "eq" && cost !== filter.cost.value) return false;
      if (filter.cost.op === "neq" && cost === filter.cost.value) return false;
      if (filter.cost.op === "gt" && cost <= filter.cost.value) return false;
      if (filter.cost.op === "gte" && cost < filter.cost.value) return false;
      if (filter.cost.op === "lt" && cost >= filter.cost.value) return false;
      if (filter.cost.op === "lte" && cost > filter.cost.value) return false;
    } else {
      if (filter.cost.min !== undefined && cost < filter.cost.min) return false;
      if (filter.cost.max !== undefined && cost > filter.cost.max) return false;
    }
  }
  if (filter.power !== undefined) {
    const power = card.power;
    if (power === undefined) {
      return false;
    }
    if ("op" in filter.power) {
      if (filter.power.op === "eq" && power !== filter.power.value)
        return false;
      if (filter.power.op === "neq" && power === filter.power.value)
        return false;
      if (filter.power.op === "gt" && power <= filter.power.value) return false;
      if (filter.power.op === "gte" && power < filter.power.value) return false;
      if (filter.power.op === "lt" && power >= filter.power.value) return false;
      if (filter.power.op === "lte" && power > filter.power.value) return false;
    } else {
      if (filter.power.min !== undefined && power < filter.power.min)
        return false;
      if (filter.power.max !== undefined && power > filter.power.max)
        return false;
    }
  }
  if (filter.currentPower !== undefined) {
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
  if (filter.state !== undefined && card.state !== filter.state) {
    return false;
  }
  if (filter.custom === "costLteSelfDonFieldCount") {
    const cost = resolved?.cost;
    const donFieldCount = state.players[playerId]?.costArea.length ?? 0;
    return cost !== undefined && cost <= donFieldCount;
  }
  return filter.custom === undefined || filter.custom === "differentNames";
};
