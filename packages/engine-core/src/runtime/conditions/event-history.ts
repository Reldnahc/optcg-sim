import type {
  CardCategory,
  CardFilter,
  CardId,
  Comparator,
  Condition,
  EffectQueueEntry,
  GameState,
  PlayerId,
} from "@optcg/types";

import { cardMatchesAnyName } from "../../card-name-matching.js";

type NumericFilter =
  | { op: Comparator; value: number }
  | { min?: number; max?: number };

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  Number.isInteger(value) &&
  value >= 0;

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

const numericFilterMatches = (
  value: number | undefined,
  filter: NumericFilter,
): boolean => {
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

export const isSupportedEventHistoryCondition = (
  condition: Extract<Condition, { type: "eventHistory" }>,
): boolean =>
  isSupportedEventHistoryFilter(condition.filter) &&
  isSupportedEventHistoryFilter(condition.sourceFilter) &&
  isNonNegativeSafeInteger(condition.value) &&
  isComparator(condition.op);

const isSupportedEventHistoryFilter = (
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return (
    keys.every(
      (key) =>
        key === "categories" ||
        key === "baseCost" ||
        key === "cost" ||
        key === "names" ||
        key === "typesAny" ||
        key === "typesIncludeAny",
    ) &&
    (filter.categories === undefined || filter.categories.length > 0) &&
    (filter.names === undefined || isStringArray(filter.names)) &&
    (filter.typesAny === undefined || isStringArray(filter.typesAny)) &&
    (filter.typesIncludeAny === undefined ||
      isStringArray(filter.typesIncludeAny)) &&
    hasSupportedNumericFilter(filter.baseCost) &&
    hasSupportedNumericFilter(filter.cost)
  );
};

const eventPayloadMatchesCardFilter = (
  state: GameState,
  payload: Record<string, unknown>,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  const rawCardId = payload["cardId"];
  if (typeof rawCardId !== "string") {
    return false;
  }
  const metadata = state.cardManifest.cards[rawCardId as CardId];
  if (metadata === undefined) {
    return false;
  }
  if (
    filter.categories !== undefined &&
    !filter.categories.includes(metadata.category)
  ) {
    return false;
  }
  if (
    filter.names !== undefined &&
    !cardMatchesAnyName(metadata, filter.names)
  ) {
    return false;
  }
  if (
    filter.typesAny !== undefined &&
    !filter.typesAny.some((typeName) => metadata.types.includes(typeName))
  ) {
    return false;
  }
  if (
    filter.typesIncludeAny !== undefined &&
    !filter.typesIncludeAny.some((typeText) =>
      metadata.types.some((typeName) => typeName.includes(typeText)),
    )
  ) {
    return false;
  }
  if (
    filter.baseCost !== undefined &&
    !numericFilterMatches(metadata.cost, filter.baseCost)
  ) {
    return false;
  }
  if (
    filter.cost !== undefined &&
    !numericFilterMatches(metadata.cost, filter.cost)
  ) {
    return false;
  }
  return true;
};

const eventPayloadMatchesSourceTarget = (
  payload: Record<string, unknown>,
  entry: EffectQueueEntry,
  sourceTarget: Extract<Condition, { type: "eventHistory" }>["sourceTarget"],
): boolean => {
  if (sourceTarget === undefined) {
    return true;
  }
  return (
    payload["sourceInstanceId"] === entry.source.instanceId &&
    payload["sourceCardId"] === entry.source.cardId
  );
};

const eventPayloadMatchesSourceFilter = (
  state: GameState,
  payload: Record<string, unknown>,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if (
    filter.categories !== undefined &&
    isCardCategory(payload["sourceCategory"]) &&
    !filter.categories.includes(payload["sourceCategory"])
  ) {
    return false;
  }
  if (
    Object.keys(filter).every((key) => key === "categories") &&
    filter.categories !== undefined &&
    isCardCategory(payload["sourceCategory"])
  ) {
    return true;
  }
  const rawCardId = payload["sourceCardId"];
  if (typeof rawCardId !== "string") {
    return false;
  }
  return eventPayloadMatchesCardFilter(
    state,
    { ...payload, cardId: rawCardId },
    filter,
  );
};

const isCardCategory = (value: unknown): value is CardCategory =>
  value === "leader" ||
  value === "character" ||
  value === "event" ||
  value === "stage" ||
  value === "don";

export const countMatchingEventHistory = (
  state: GameState,
  entry: EffectQueueEntry,
  playerId: PlayerId,
  condition: Extract<Condition, { type: "eventHistory" }>,
): number =>
  state.eventJournal.filter((event) => {
    if (event.type !== condition.event || !isRecord(event.payload)) {
      return false;
    }
    if (event.payload["playerId"] !== playerId) {
      return false;
    }
    if (event.payload["turnNumber"] !== state.turn.globalTurn) {
      return false;
    }
    return (
      eventPayloadMatchesCardFilter(state, event.payload, condition.filter) &&
      eventPayloadMatchesSourceTarget(
        event.payload,
        entry,
        condition.sourceTarget,
      ) &&
      eventPayloadMatchesSourceFilter(
        state,
        event.payload,
        condition.sourceFilter,
      )
    );
  }).length;
