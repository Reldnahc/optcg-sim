import type {
  CardFilter,
  CardInstance,
  Condition,
  EffectQueueEntry,
  GameState,
  PlayerId,
  PlayerRef,
} from "@optcg/types";

import { cardMatchesAnyName } from "../../card-name-matching.js";
import {
  cardMatchesCharacterFieldCountFilter,
  isSupportedCharacterFieldCountFilter,
  isSupportedLeaderOrCharacterFieldCountFilter,
} from "./field-count-character-filter.js";
import {
  compareComparator,
  isComparator,
  isNonNegativeSafeInteger,
} from "./comparison.js";

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

const isSupportedDonFieldCountFilter = (
  filter: CardFilter | undefined,
): filter is Required<Pick<CardFilter, "categories">> & {
  state?: "active" | "rested" | "attached";
} => {
  if (filter === undefined) {
    return false;
  }
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  for (const key of keys) {
    if (key !== "categories" && key !== "state") {
      return false;
    }
  }
  if (
    !Array.isArray(filter.categories) ||
    filter.categories.length !== 1 ||
    filter.categories[0] !== "don"
  ) {
    return false;
  }
  const stateValue = filter.state as unknown;
  return (
    stateValue === undefined ||
    stateValue === "active" ||
    stateValue === "rested" ||
    stateValue === "attached"
  );
};

const isSupportedPublicFieldStateCountFilter = (
  filter: CardFilter | undefined,
): filter is { state: "active" | "rested" } => {
  if (filter === undefined) {
    return false;
  }
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return (
    keys.length === 1 &&
    keys[0] === "state" &&
    (filter.state === "active" || filter.state === "rested")
  );
};

const isSupportedPublicFieldNameCountFilter = (
  filter: CardFilter | undefined,
): filter is { names: string[]; excludeSelf?: true } => {
  if (filter === undefined) {
    return false;
  }
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return (
    keys.every((key) => key === "names" || key === "excludeSelf") &&
    Array.isArray(filter.names) &&
    filter.names.length > 0 &&
    filter.names.every((name) => typeof name === "string") &&
    (filter.excludeSelf === undefined || filter.excludeSelf)
  );
};

export const isSupportedFieldCountFilter = (
  filter: CardFilter | undefined,
): boolean =>
  isSupportedDonFieldCountFilter(filter) ||
  isSupportedCharacterFieldCountFilter(filter) ||
  isSupportedLeaderOrCharacterFieldCountFilter(filter) ||
  isSupportedPublicFieldStateCountFilter(filter) ||
  isSupportedPublicFieldNameCountFilter(filter);

const countPublicDonOnField = (
  state: GameState,
  playerId: PlayerId,
  stateFilter: CardFilter["state"] | undefined,
): number => {
  const player = state.players[playerId];
  if (player === undefined) {
    return 0;
  }
  const attachedIds = new Set([
    ...player.leader.attachedDon,
    ...player.characters.flatMap((card) => card.attachedDon),
  ]);
  const fieldDonById = new Map<string, CardInstance>();
  for (const card of player.costArea) {
    if (card.owner !== playerId || card.controller !== playerId) {
      continue;
    }
    fieldDonById.set(card.instanceId, card);
  }
  switch (stateFilter) {
    case undefined:
      return fieldDonById.size;
    case "active":
    case "rested": {
      let count = 0;
      for (const card of fieldDonById.values()) {
        if (!attachedIds.has(card.instanceId) && card.state === stateFilter) {
          count += 1;
        }
      }
      return count;
    }
    case "attached": {
      let count = 0;
      for (const attachedId of attachedIds) {
        if (fieldDonById.has(attachedId)) {
          count += 1;
        }
      }
      return count;
    }
  }
};

const cardMatchesFieldCountFilter = (
  state: GameState,
  card: CardInstance,
  filter: CardFilter,
): boolean => {
  const metadata = state.cardManifest.cards[card.cardId];
  return (
    metadata !== undefined &&
    cardMatchesCharacterFieldCountFilter(metadata, card, filter)
  );
};

const countDistinctMatchingNames = (
  state: GameState,
  cards: readonly CardInstance[],
): number => {
  const distinctNames = new Set<string>();
  for (const card of cards) {
    const name = state.cardManifest.cards[card.cardId]?.name;
    if (name !== undefined) {
      distinctNames.add(name);
    }
  }
  return distinctNames.size;
};

const countPublicCharactersOnField = (
  state: GameState,
  entry: EffectQueueEntry,
  playerId: PlayerId,
  filter: CardFilter,
): number => {
  const player = state.players[playerId];
  if (player === undefined) {
    return 0;
  }
  const matchingCharacters = player.characters.filter((card) => {
    if (
      filter.excludeSelf === true &&
      card.instanceId === entry.source.instanceId
    ) {
      return false;
    }
    if (
      filter.state !== undefined &&
      filter.state !== "active" &&
      filter.state !== "rested"
    ) {
      return false;
    }
    if (filter.state !== undefined && card.state !== filter.state) {
      return false;
    }
    if (
      filter.anyOf === undefined &&
      filter.names === undefined &&
      filter.typesAny === undefined &&
      filter.typesIncludeAny === undefined &&
      filter.baseCost === undefined &&
      filter.cost === undefined &&
      filter.power === undefined &&
      filter.currentPower === undefined
    ) {
      return true;
    }
    return cardMatchesFieldCountFilter(state, card, filter);
  });
  return filter.custom === "differentNames"
    ? countDistinctMatchingNames(state, matchingCharacters)
    : matchingCharacters.length;
};

const countPublicLeaderOrCharactersOnField = (
  state: GameState,
  entry: EffectQueueEntry,
  playerId: PlayerId,
  filter: CardFilter,
): number => {
  const player = state.players[playerId];
  if (player === undefined) {
    return 0;
  }
  const fieldCards = [player.leader, ...player.characters];
  const matchingCards = fieldCards.filter((card) => {
    if (
      filter.excludeSelf === true &&
      card.instanceId === entry.source.instanceId
    ) {
      return false;
    }
    if (
      filter.state !== undefined &&
      filter.state !== "active" &&
      filter.state !== "rested"
    ) {
      return false;
    }
    if (filter.state !== undefined && card.state !== filter.state) {
      return false;
    }
    return cardMatchesFieldCountFilter(state, card, filter);
  });
  return filter.custom === "differentNames"
    ? countDistinctMatchingNames(state, matchingCards)
    : matchingCards.length;
};

const countPublicCardsOnFieldByState = (
  state: GameState,
  playerId: PlayerId,
  stateFilter: "active" | "rested",
): number => {
  const player = state.players[playerId];
  if (player === undefined) {
    return 0;
  }
  const attachedIds = new Set([
    ...player.leader.attachedDon,
    ...player.characters.flatMap((card) => card.attachedDon),
  ]);
  const fieldCards: CardInstance[] = [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
    ...player.costArea.filter((card) => !attachedIds.has(card.instanceId)),
  ];
  return fieldCards.filter((card) => card.state === stateFilter).length;
};

const countPublicCardsOnFieldByName = (
  state: GameState,
  entry: EffectQueueEntry,
  playerId: PlayerId,
  names: readonly string[],
  excludeSelf?: true,
): number => {
  const player = state.players[playerId];
  if (player === undefined) {
    return 0;
  }
  const fieldCards: CardInstance[] = [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
  ];
  return fieldCards.filter((card) => {
    if (excludeSelf === true && card.instanceId === entry.source.instanceId) {
      return false;
    }
    const metadata = state.cardManifest.cards[card.cardId];
    return metadata !== undefined && cardMatchesAnyName(metadata, names);
  }).length;
};

const countPublicFieldMatches = (
  state: GameState,
  entry: EffectQueueEntry,
  playerId: PlayerId,
  filter: CardFilter | undefined,
): number | undefined => {
  if (isSupportedDonFieldCountFilter(filter)) {
    return countPublicDonOnField(state, playerId, filter.state);
  }
  if (isSupportedCharacterFieldCountFilter(filter)) {
    return countPublicCharactersOnField(state, entry, playerId, filter);
  }
  if (isSupportedLeaderOrCharacterFieldCountFilter(filter)) {
    return countPublicLeaderOrCharactersOnField(state, entry, playerId, filter);
  }
  if (isSupportedPublicFieldStateCountFilter(filter)) {
    return countPublicCardsOnFieldByState(state, playerId, filter.state);
  }
  if (isSupportedPublicFieldNameCountFilter(filter)) {
    return countPublicCardsOnFieldByName(
      state,
      entry,
      playerId,
      filter.names,
      filter.excludeSelf,
    );
  }
  return undefined;
};

const countSupportedFieldOperand = (
  state: GameState,
  entry: EffectQueueEntry,
  operand: {
    player: PlayerRef;
    filter?: CardFilter;
  },
): { supported: true; count: number } | { supported: false } => {
  const playerId = resolveConditionPlayer(state, entry, operand.player);
  if (playerId === undefined || state.players[playerId] === undefined) {
    return { supported: false };
  }
  const count = countPublicFieldMatches(state, entry, playerId, operand.filter);
  return count === undefined
    ? { supported: false }
    : { supported: true, count };
};

export const evaluateFieldCount = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "fieldCount" }>,
): ConditionEvaluationResult => {
  if (
    !isSupportedFieldCountFilter(condition.filter) ||
    !isNonNegativeSafeInteger(condition.value) ||
    !isComparator(condition.op)
  ) {
    return { supported: false };
  }
  const playerId = resolveConditionPlayer(state, entry, condition.player);
  if (playerId === undefined || state.players[playerId] === undefined) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: compareComparator(
      condition.op,
      countPublicFieldMatches(state, entry, playerId, condition.filter) ?? 0,
      condition.value,
    ),
  };
};

export const evaluateFieldCountTotal = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "fieldCountTotal" }>,
): ConditionEvaluationResult => {
  if (
    !isSupportedFieldCountFilter(condition.filter) ||
    !isNonNegativeSafeInteger(condition.value) ||
    !isComparator(condition.op)
  ) {
    return { supported: false };
  }
  let total = 0;
  for (const playerRef of condition.players) {
    const playerId = resolveConditionPlayer(state, entry, playerRef);
    if (playerId === undefined || state.players[playerId] === undefined) {
      return { supported: false };
    }
    total +=
      countPublicFieldMatches(state, entry, playerId, condition.filter) ?? 0;
  }
  return {
    supported: true,
    passed: compareComparator(condition.op, total, condition.value),
  };
};

export const evaluateFieldCountDifference = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "fieldCountDifference" }>,
): ConditionEvaluationResult => {
  if (
    !isNonNegativeSafeInteger(condition.value) ||
    !isComparator(condition.op)
  ) {
    return { supported: false };
  }
  const minuend = countSupportedFieldOperand(state, entry, condition.minuend);
  if (!minuend.supported) {
    return { supported: false };
  }
  const subtrahend = countSupportedFieldOperand(
    state,
    entry,
    condition.subtrahend,
  );
  if (!subtrahend.supported) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: compareComparator(
      condition.op,
      minuend.count - subtrahend.count,
      condition.value,
    ),
  };
};

export const isSupportedFieldCountCondition = (
  condition: Extract<Condition, { type: "fieldCount" }>,
): boolean =>
  isSupportedFieldCountFilter(condition.filter) &&
  isNonNegativeSafeInteger(condition.value) &&
  isComparator(condition.op) &&
  (condition.player === "self" || condition.player === "opponent");

export const isSupportedFieldCountTotalCondition = (
  condition: Extract<Condition, { type: "fieldCountTotal" }>,
): boolean =>
  isSupportedFieldCountFilter(condition.filter) &&
  isNonNegativeSafeInteger(condition.value) &&
  isComparator(condition.op) &&
  Array.isArray(condition.players) &&
  condition.players.length > 0 &&
  condition.players.every(
    (player) => player === "self" || player === "opponent",
  );

export const isSupportedFieldCountDifferenceCondition = (
  condition: Extract<Condition, { type: "fieldCountDifference" }>,
): boolean =>
  isSupportedFieldCountFilter(condition.minuend.filter) &&
  isSupportedFieldCountFilter(condition.subtrahend.filter) &&
  isNonNegativeSafeInteger(condition.value) &&
  isComparator(condition.op) &&
  (condition.minuend.player === "self" ||
    condition.minuend.player === "opponent") &&
  (condition.subtrahend.player === "self" ||
    condition.subtrahend.player === "opponent");
