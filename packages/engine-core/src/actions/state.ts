import type {
  CardInstance,
  CardFilter,
  CardRef,
  Comparator,
  DynamicNumberValue,
  GameState,
  PlayerId,
  PlayerState,
  ResolvedCard,
  SavedFieldObjectTargetBinding,
  SequenceSavedResultReference,
  SequenceSavedResultReferenceMap,
} from "@optcg/types";

import { cardMatchesAnyName } from "../card-name-matching.js";

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
  "attributesNotAny",
  "baseCost",
  "categories",
  "colorsAny",
  "cost",
  "names",
  "typesAny",
  "typesIncludeAny",
  "typesNotIncludeAny",
  "nameNot",
]);
const supportedHandSelectionFilterKeys = new Set([
  "anyOf",
  "attributesAny",
  "attributesNotAny",
  "baseCost",
  "categories",
  "colorRelation",
  "colorsAny",
  "custom",
  "cost",
  "effectEntryPoint",
  "excludeSelf",
  "names",
  "nameRelation",
  "nameNot",
  "power",
  "statComparisons",
  "state",
  "typesAny",
  "typesIncludeAny",
  "typesNotIncludeAny",
]);
const supportedHandSelectionStates = new Set(["active", "rested", "attached"]);

const supportedHandSelectionCustomFilters = new Set([
  "costLteSelfDonFieldCount",
  "differentNames",
]);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isSupportedColorRelation = (
  relation: CardFilter["colorRelation"],
): boolean =>
  relation === undefined ||
  (relation.binding.family === "selectedTargets" &&
    typeof relation.binding.saveResultAs === "string" &&
    (relation.binding.objectIndex === undefined ||
      Number.isSafeInteger(relation.binding.objectIndex)));

const isSupportedNameRelation = (
  relation: CardFilter["nameRelation"],
): boolean => relation === undefined || relation.selection.length > 0;

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

const isSupportedStatComparisonValue = (
  value: number | DynamicNumberValue,
): boolean => {
  if (typeof value === "number") {
    return true;
  }
  if (value.type === "savedNumber") {
    return typeof value.selection === "string";
  }
  return (
    value.type === "countMatchingZoneCards" &&
    (value.player === "self" || value.player === "opponent") &&
    value.zone === "costArea" &&
    value.filter === undefined &&
    Number.isInteger(value.per) &&
    value.per > 0 &&
    Number.isInteger(value.multiplier) &&
    (value.offset === undefined || Number.isInteger(value.offset)) &&
    (value.minimum === undefined || Number.isInteger(value.minimum))
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
    (filter.attributesNotAny === undefined ||
      isStringArray(filter.attributesNotAny)) &&
    (filter.categories === undefined || isStringArray(filter.categories)) &&
    isSupportedColorRelation(filter.colorRelation) &&
    (filter.colorsAny === undefined || isStringArray(filter.colorsAny)) &&
    isSupportedNumericFilter(filter.cost) &&
    isSupportedNumericFilter(filter.baseCost) &&
    (filter.names === undefined || isStringArray(filter.names)) &&
    (filter.typesAny === undefined || isStringArray(filter.typesAny)) &&
    (filter.typesIncludeAny === undefined ||
      isStringArray(filter.typesIncludeAny)) &&
    (filter.typesNotIncludeAny === undefined ||
      isStringArray(filter.typesNotIncludeAny)) &&
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
    (filter.attributesNotAny === undefined ||
      isStringArray(filter.attributesNotAny)) &&
    (filter.categories === undefined || isStringArray(filter.categories)) &&
    isSupportedColorRelation(filter.colorRelation) &&
    (filter.colorsAny === undefined || isStringArray(filter.colorsAny)) &&
    (filter.names === undefined || isStringArray(filter.names)) &&
    isSupportedNameRelation(filter.nameRelation) &&
    (filter.typesAny === undefined || isStringArray(filter.typesAny)) &&
    (filter.typesIncludeAny === undefined ||
      isStringArray(filter.typesIncludeAny)) &&
    (filter.typesNotIncludeAny === undefined ||
      isStringArray(filter.typesNotIncludeAny)) &&
    (filter.nameNot === undefined || isStringArray(filter.nameNot)) &&
    isSupportedEffectEntryPointFilter(filter.effectEntryPoint) &&
    (filter.excludeSelf === undefined || filter.excludeSelf) &&
    (filter.state === undefined ||
      supportedHandSelectionStates.has(filter.state)) &&
    isSupportedNumericFilter(filter.cost) &&
    isSupportedNumericFilter(filter.baseCost) &&
    isSupportedNumericFilter(filter.power) &&
    (filter.statComparisons === undefined ||
      (filter.statComparisons.length > 0 &&
        filter.statComparisons.every(
          (comparison) =>
            (comparison.stat === "cost" ||
              comparison.stat === "baseCost" ||
              comparison.stat === "power") &&
            typeof comparison.op === "string" &&
            isSupportedStatComparisonValue(comparison.value),
        ))) &&
    (filter.custom === undefined ||
      supportedHandSelectionCustomFilters.has(filter.custom))
  );
};

const resolveFilterNumberValue = (
  state: GameState | undefined,
  controllerId: PlayerId | undefined,
  value: number | DynamicNumberValue,
  savedReferences?: SequenceSavedResultReferenceMap,
): number | null => {
  if (typeof value === "number") {
    return value;
  }
  if (value.type === "savedNumber") {
    const reference = savedReferences?.[value.selection];
    return reference?.kind === "chosenNumber" ? reference.value : null;
  }
  if (
    state === undefined ||
    controllerId === undefined ||
    value.type !== "countMatchingZoneCards" ||
    value.zone !== "costArea" ||
    value.filter !== undefined
  ) {
    return null;
  }
  const playerId =
    value.player === "self" ? controllerId : getOpponentId(state, controllerId);
  if (playerId === null) {
    return null;
  }
  const count = state.players[playerId]?.costArea.length;
  if (count === undefined || value.per <= 0) {
    return null;
  }
  const resolved =
    Math.floor(count / value.per) * value.multiplier + (value.offset ?? 0);
  return value.minimum === undefined
    ? resolved
    : Math.max(resolved, value.minimum);
};

const numericComparisonMatches = (
  left: number,
  comparison: { op: Comparator; value: number },
): boolean => {
  if (comparison.op === "eq") return left === comparison.value;
  if (comparison.op === "neq") return left !== comparison.value;
  if (comparison.op === "gt") return left > comparison.value;
  if (comparison.op === "gte") return left >= comparison.value;
  if (comparison.op === "lt") return left < comparison.value;
  return left <= comparison.value;
};

const savedFieldObjectCardForBinding = (
  state: GameState | undefined,
  binding: SavedFieldObjectTargetBinding,
  savedReferences: SequenceSavedResultReferenceMap | undefined,
): ResolvedCard | undefined => {
  if (state === undefined || binding.family !== "selectedTargets") {
    return undefined;
  }
  const saved = savedReferences?.[binding.saveResultAs];
  if (saved?.kind !== "selectedTargets") {
    return undefined;
  }
  const object = saved.targets[binding.objectIndex ?? 0]?.object;
  return object === undefined
    ? undefined
    : state.cardManifest.cards[object.cardId];
};

const cardMatchesColorRelation = (
  state: GameState | undefined,
  card: ResolvedCard,
  relation: CardFilter["colorRelation"],
  savedReferences: SequenceSavedResultReferenceMap | undefined,
): boolean => {
  if (relation === undefined) {
    return true;
  }
  const savedCard = savedFieldObjectCardForBinding(
    state,
    relation.binding,
    savedReferences,
  );
  if (savedCard === undefined) {
    return false;
  }
  return !card.colors.some((color) => savedCard.colors.includes(color));
};

const savedCardsForNameRelation = (
  state: GameState | undefined,
  relation: NonNullable<CardFilter["nameRelation"]>,
  savedReferences: SequenceSavedResultReferenceMap | undefined,
): ResolvedCard[] | undefined => {
  if (state === undefined) {
    return undefined;
  }
  const saved = savedReferences?.[relation.selection];
  const selectedCards = selectedCardsForNameRelation(saved);
  if (selectedCards === undefined || selectedCards.length === 0) {
    return undefined;
  }
  const cards = selectedCards
    .map((ref) => state.cardManifest.cards[ref.cardId])
    .filter((card): card is ResolvedCard => card !== undefined);
  return cards.length === selectedCards.length ? cards : undefined;
};

const selectedCardsForNameRelation = (
  saved: SequenceSavedResultReference | undefined,
): readonly CardRef[] | undefined => {
  if (saved?.kind === "selectedCards") {
    return saved.cards;
  }
  if (saved?.kind === "paidCost") {
    return saved.selectedCards;
  }
  return undefined;
};

const cardMatchesNameRelation = (
  state: GameState | undefined,
  card: ResolvedCard,
  relation: CardFilter["nameRelation"],
  savedReferences: SequenceSavedResultReferenceMap | undefined,
): boolean => {
  if (relation === undefined) {
    return true;
  }
  const savedCards = savedCardsForNameRelation(
    state,
    relation,
    savedReferences,
  );
  if (savedCards === undefined) {
    return false;
  }
  return savedCards.some((savedCard) =>
    cardMatchesAnyName(card, [savedCard.name]),
  );
};

const cardMatchesBaseFilter = (
  state: GameState | undefined,
  controllerId: PlayerId | undefined,
  card: ResolvedCard | undefined,
  filter: CardFilter,
  savedReferences?: SequenceSavedResultReferenceMap,
): boolean => {
  if (card === undefined) return false;
  if (
    filter.anyOf !== undefined &&
    !filter.anyOf.some((candidate) =>
      cardMatchesBaseFilter(
        state,
        controllerId,
        card,
        candidate,
        savedReferences,
      ),
    )
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
    !cardMatchesColorRelation(
      state,
      card,
      filter.colorRelation,
      savedReferences,
    )
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
    filter.typesIncludeAny !== undefined &&
    !filter.typesIncludeAny.some((typeText) =>
      card.types.some((type) => type.includes(typeText)),
    )
  ) {
    return false;
  }
  if (
    filter.typesNotIncludeAny !== undefined &&
    filter.typesNotIncludeAny.some((typeText) =>
      card.types.some((type) => type.includes(typeText)),
    )
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
  if (
    filter.attributesNotAny !== undefined &&
    filter.attributesNotAny.some((attribute) =>
      card.attributes.includes(attribute),
    )
  ) {
    return false;
  }
  if (filter.names !== undefined && !cardMatchesAnyName(card, filter.names)) {
    return false;
  }
  if (
    !cardMatchesNameRelation(state, card, filter.nameRelation, savedReferences)
  ) {
    return false;
  }
  if (filter.cost !== undefined) {
    const cost = card.cost;
    if (cost === undefined) {
      return false;
    }
    if ("op" in filter.cost) {
      if (!numericComparisonMatches(cost, filter.cost)) return false;
    } else {
      if (filter.cost.min !== undefined && cost < filter.cost.min) return false;
      if (filter.cost.max !== undefined && cost > filter.cost.max) return false;
    }
  }
  if (filter.baseCost !== undefined) {
    const cost = card.cost;
    if (cost === undefined) {
      return false;
    }
    if ("op" in filter.baseCost) {
      if (!numericComparisonMatches(cost, filter.baseCost)) return false;
    } else {
      if (filter.baseCost.min !== undefined && cost < filter.baseCost.min)
        return false;
      if (filter.baseCost.max !== undefined && cost > filter.baseCost.max)
        return false;
    }
  }
  if (filter.power !== undefined) {
    const power = card.power;
    if (power === undefined) {
      return false;
    }
    if ("op" in filter.power) {
      if (!numericComparisonMatches(power, filter.power)) return false;
    } else {
      if (filter.power.min !== undefined && power < filter.power.min)
        return false;
      if (filter.power.max !== undefined && power > filter.power.max)
        return false;
    }
  }
  if (filter.currentPower !== undefined) {
    const power = card.power;
    if (power === undefined) {
      return false;
    }
    if ("op" in filter.currentPower) {
      if (!numericComparisonMatches(power, filter.currentPower)) return false;
    } else {
      if (
        filter.currentPower.min !== undefined &&
        power < filter.currentPower.min
      )
        return false;
      if (
        filter.currentPower.max !== undefined &&
        power > filter.currentPower.max
      )
        return false;
    }
  }
  if (filter.statComparisons !== undefined) {
    for (const comparison of filter.statComparisons) {
      const value = resolveFilterNumberValue(
        state,
        controllerId,
        comparison.value,
        savedReferences,
      );
      const left =
        comparison.stat === "cost" || comparison.stat === "baseCost"
          ? card.cost
          : comparison.stat === "power"
            ? card.power
            : undefined;
      if (
        value === null ||
        left === undefined ||
        !numericComparisonMatches(left, { op: comparison.op, value })
      ) {
        return false;
      }
    }
  }
  return !(
    filter.nameNot !== undefined && cardMatchesAnyName(card, filter.nameNot)
  );
};

const isSupportedEffectEntryPointFilter = (
  filter: CardFilter["effectEntryPoint"],
): boolean => filter === undefined || typeof filter.trigger.type === "string";

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const cardMatchesEffectEntryPointFilter = (
  state: GameState,
  card: ResolvedCard | undefined,
  filter: CardFilter["effectEntryPoint"],
): boolean => {
  if (filter === undefined) {
    return true;
  }
  const effectDefinitionId =
    card?.support.status === "implemented-dsl"
      ? card.support.effectDefinitionId
      : undefined;
  const definition =
    effectDefinitionId === undefined
      ? undefined
      : state.cardManifest.effectDefinitions?.[effectDefinitionId];
  const hasEntryPoint =
    definition?.effects.some(
      (effect) =>
        valuesEqual(effect.trigger, filter.trigger) &&
        valuesEqual(effect.condition, filter.condition),
    ) ?? false;
  return filter.mode === "with" ? hasEntryPoint : !hasEntryPoint;
};

export const cardMatchesSearchFilter = (
  card: ResolvedCard | undefined,
  filter: CardFilter,
): boolean => cardMatchesBaseFilter(undefined, undefined, card, filter);

export const cardMatchesHandSelectionFilter = (
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  filter: CardFilter | undefined,
  savedReferences?: SequenceSavedResultReferenceMap,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  const resolved = state.cardManifest.cards[card.cardId];
  if (
    !cardMatchesBaseFilter(state, playerId, resolved, filter, savedReferences)
  ) {
    return false;
  }
  if (
    !cardMatchesEffectEntryPointFilter(state, resolved, filter.effectEntryPoint)
  ) {
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
