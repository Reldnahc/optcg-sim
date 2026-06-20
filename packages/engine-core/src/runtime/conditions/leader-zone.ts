import type {
  CardInstance,
  CardFilter,
  Condition,
  EffectQueueEntry,
  GameState,
  PlayerId,
  PlayerRef,
  Comparator,
  ResolvedCard,
} from "@optcg/types";

import {
  cardMatchesAnyName,
  cardMatchesAnyAttribute,
  cardMatchesAnyType,
  cardMatchesAnyTypeIncludes,
  cardMatchesNameContains,
} from "../../card-name-matching.js";

interface ConditionEvaluationSuccess {
  supported: true;
  passed: boolean;
}

interface ConditionEvaluationFailure {
  supported: false;
}

type ConditionEvaluationResult =
  | ConditionEvaluationSuccess
  | ConditionEvaluationFailure;

type SupportedLeaderZoneFilter = Required<Pick<CardFilter, "categories">> &
  Pick<
    CardFilter,
    | "typesAny"
    | "typesIncludeAny"
    | "attributesAny"
    | "attributesNotAny"
    | "colorsAny"
    | "names"
    | "nameContains"
    | "power"
    | "currentPower"
    | "state"
    | "anyOf"
  >;

type LeaderMetadata = ResolvedCard & {
  colors: string[];
  types: string[];
  attributes: string[];
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

type NumericFilter =
  | { op: Comparator; value: number }
  | { min?: number; max?: number };

const isComparator = (value: unknown): value is Comparator => {
  switch (value) {
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return true;
    default:
      return false;
  }
};

const hasSupportedNumericFilter = (
  filter: NumericFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if ("op" in filter) {
    return isComparator(filter.op) && Number.isFinite(filter.value);
  }
  return (
    (filter.min === undefined || Number.isFinite(filter.min)) &&
    (filter.max === undefined || Number.isFinite(filter.max)) &&
    (filter.min === undefined ||
      filter.max === undefined ||
      filter.min <= filter.max)
  );
};

const compare = (op: Comparator, left: number, right: number): boolean => {
  switch (op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
  }
};

const numericFilterMatches = (
  value: number | undefined,
  filter: NumericFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if (value === undefined) {
    return false;
  }
  if ("op" in filter) {
    return compare(filter.op, value, filter.value);
  }
  if (filter.min !== undefined && value < filter.min) {
    return false;
  }
  if (filter.max !== undefined && value > filter.max) {
    return false;
  }
  return true;
};

const resolveConditionPlayer = (
  state: GameState,
  entry: EffectQueueEntry,
  player: PlayerRef,
): PlayerId | undefined => {
  if (player === "self") {
    return entry.controllerId;
  }
  if (player !== "opponent") {
    return undefined;
  }
  const playerIds = Object.keys(state.players) as PlayerId[];
  const selfIndex = playerIds.findIndex(
    (playerId) => playerId === entry.controllerId,
  );
  if (selfIndex < 0) {
    return undefined;
  }
  return playerIds.find((playerId) => playerId !== entry.controllerId);
};

const readLeaderMetadata = (
  state: GameState,
  playerId: PlayerId,
): LeaderMetadata | undefined => {
  const player = state.players[playerId];
  if (player === undefined) {
    return undefined;
  }
  const card = state.cardManifest.cards[player.leader.cardId];
  if (card === undefined || card.category !== "leader") {
    return undefined;
  }
  if (
    !isStringArray(card.colors) ||
    !isStringArray(card.types) ||
    !isStringArray(card.attributes)
  ) {
    return undefined;
  }
  return card;
};

export const isSupportedLeaderZoneFilter = (
  filter: CardFilter,
): filter is SupportedLeaderZoneFilter => {
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  for (const key of keys) {
    if (
      key !== "categories" &&
      key !== "typesAny" &&
      key !== "typesIncludeAny" &&
      key !== "attributesAny" &&
      key !== "attributesNotAny" &&
      key !== "colorsAny" &&
      key !== "names" &&
      key !== "nameContains" &&
      key !== "power" &&
      key !== "currentPower" &&
      key !== "state" &&
      key !== "anyOf"
    ) {
      return false;
    }
  }
  if (
    !Array.isArray(filter.categories) ||
    filter.categories.length !== 1 ||
    filter.categories[0] !== "leader"
  ) {
    return false;
  }
  const hasTypes =
    Array.isArray(filter.typesAny) &&
    filter.typesAny.length > 0 &&
    filter.typesAny.every((value) => typeof value === "string");
  const hasTypesInclude =
    Array.isArray(filter.typesIncludeAny) &&
    filter.typesIncludeAny.length > 0 &&
    filter.typesIncludeAny.every((value) => typeof value === "string");
  const hasAttributes =
    Array.isArray(filter.attributesAny) &&
    filter.attributesAny.length > 0 &&
    filter.attributesAny.every((value) => typeof value === "string");
  const hasExcludedAttributes =
    Array.isArray(filter.attributesNotAny) &&
    filter.attributesNotAny.length > 0 &&
    filter.attributesNotAny.every((value) => typeof value === "string");
  const hasColors =
    Array.isArray(filter.colorsAny) &&
    filter.colorsAny.length > 0 &&
    filter.colorsAny.every((value) => typeof value === "string");
  const hasNames =
    Array.isArray(filter.names) &&
    filter.names.length > 0 &&
    filter.names.every((value) => typeof value === "string");
  const hasNameContains =
    typeof filter.nameContains === "string" && filter.nameContains.length > 0;
  const hasPower = filter.power !== undefined;
  const hasCurrentPower = filter.currentPower !== undefined;
  const hasState = filter.state === "active" || filter.state === "rested";
  const hasAnyOf =
    Array.isArray(filter.anyOf) &&
    filter.anyOf.length > 0 &&
    filter.anyOf.every((branch) =>
      isSupportedLeaderZoneFilter({
        categories: ["leader"],
        ...branch,
      }),
    );
  return (
    hasSupportedNumericFilter(filter.power) &&
    hasSupportedNumericFilter(filter.currentPower) &&
    (hasTypes ||
      hasTypesInclude ||
      hasAttributes ||
      hasExcludedAttributes ||
      hasColors ||
      hasNames ||
      hasNameContains ||
      hasPower ||
      hasCurrentPower ||
      hasState ||
      hasAnyOf)
  );
};

const leaderMatchesFilter = (
  leader: LeaderMetadata,
  leaderCard: CardInstance,
  filter: SupportedLeaderZoneFilter,
): boolean => {
  const typesMatch =
    filter.typesAny === undefined
      ? true
      : cardMatchesAnyType(leader, filter.typesAny);
  const typesIncludeMatch =
    filter.typesIncludeAny === undefined
      ? true
      : cardMatchesAnyTypeIncludes(leader, filter.typesIncludeAny);
  const attributesMatch =
    filter.attributesAny === undefined
      ? true
      : cardMatchesAnyAttribute(leader, filter.attributesAny);
  const excludedAttributesMatch =
    filter.attributesNotAny === undefined
      ? true
      : !cardMatchesAnyAttribute(leader, filter.attributesNotAny);
  const colorsMatch =
    filter.colorsAny === undefined
      ? true
      : filter.colorsAny.some((color) => leader.colors.includes(color));
  const namesMatch =
    filter.names === undefined
      ? true
      : cardMatchesAnyName(leader, filter.names);
  const nameContainsMatch =
    filter.nameContains === undefined
      ? true
      : cardMatchesNameContains(leader, filter.nameContains);
  const powerMatch = numericFilterMatches(leader.power, filter.power);
  const currentPower =
    leader.power === undefined
      ? undefined
      : leader.power + leaderCard.attachedDon.length * 1000;
  const currentPowerMatch = numericFilterMatches(
    currentPower,
    filter.currentPower,
  );
  const stateMatch =
    filter.state === undefined ? true : leaderCard.state === filter.state;
  const anyOfMatch =
    filter.anyOf === undefined
      ? true
      : filter.anyOf.some((branch) =>
          leaderMatchesFilter(leader, leaderCard, {
            categories: ["leader"],
            ...branch,
          }),
        );
  return (
    typesMatch &&
    typesIncludeMatch &&
    attributesMatch &&
    excludedAttributesMatch &&
    colorsMatch &&
    namesMatch &&
    nameContainsMatch &&
    powerMatch &&
    currentPowerMatch &&
    stateMatch &&
    anyOfMatch
  );
};

export const evaluateHasCardInZone = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "hasCardInZone" }>,
): ConditionEvaluationResult => {
  if (
    condition.zone !== "leaderArea" ||
    !isSupportedLeaderZoneFilter(condition.filter)
  ) {
    return { supported: false };
  }
  const playerId = resolveConditionPlayer(state, entry, condition.player);
  if (playerId === undefined || state.players[playerId] === undefined) {
    return { supported: false };
  }
  const player = state.players[playerId];
  const leader = readLeaderMetadata(state, playerId);
  if (leader === undefined) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: leaderMatchesFilter(leader, player.leader, condition.filter),
  };
};
