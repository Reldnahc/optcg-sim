import type {
  CardFilter,
  CardInstance,
  Comparator,
  Condition,
  EffectQueueEntry,
  GameState,
  PlayerId,
  PlayerRef,
  ResolvedCard,
} from "@optcg/types";

import {
  cardMatchesCharacterFieldCountFilter,
  isSupportedCharacterFieldCountFilter,
} from "./field-count-character-filter.js";
import {
  evaluateLifeCountDifference,
  evaluateLifeCountTotal,
  isSupportedLifeCountDifferenceCondition,
  isSupportedLifeCountTotalCondition,
} from "./life-count.js";
import {
  evaluateHasCardInZone,
  isSupportedLeaderZoneFilter,
} from "./leader-zone.js";
import {
  countMatchingEventHistory,
  isSupportedEventHistoryCondition,
} from "./event-history.js";
import {
  countTrashCardsMatchingFilter,
  isSupportedTrashCountFilter,
} from "./trash-count.js";
import { cardMatchesAnyName } from "../../card-name-matching.js";
import {
  evaluateCardStatComparison,
  isSupportedCardStatComparisonCondition,
  type ConditionEvaluationContext,
} from "./card-stat-comparison.js";

interface ConditionEvaluationSuccess {
  supported: true;
  passed: boolean;
}

interface ConditionEvaluationFailure {
  supported: false;
}

export type ConditionEvaluationResult =
  | ConditionEvaluationSuccess
  | ConditionEvaluationFailure;

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
    default: {
      const exhaustive: never = op;
      return exhaustive;
    }
  }
};

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

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  Number.isInteger(value) &&
  value >= 0;

const isFieldZone = (zone: CardInstance["zone"]["zone"]): boolean =>
  zone === "leaderArea" || zone === "characterArea" || zone === "stageArea";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const findLiveSourceFieldCard = (
  state: GameState,
  entry: EffectQueueEntry,
): CardInstance | undefined => {
  const player = state.players[entry.source.playerId];
  if (player === undefined) {
    return undefined;
  }
  const cards: CardInstance[] = [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
  ];
  return cards.find((card) => card.instanceId === entry.source.instanceId);
};

const evaluateAttachedDonCount = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "attachedDonCount" }>,
): ConditionEvaluationResult => {
  if (condition.target.type !== "self") {
    return { supported: false };
  }
  if (!Number.isInteger(condition.value) || condition.value < 0) {
    return { supported: false };
  }
  const sourceZone = entry.source.zone;
  if (sourceZone === undefined || !isFieldZone(sourceZone.zone)) {
    return { supported: false };
  }
  const source = findLiveSourceFieldCard(state, entry);
  if (
    source === undefined ||
    source.cardId !== entry.source.cardId ||
    source.controller !== entry.source.playerId ||
    !isFieldZone(source.zone.zone)
  ) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: compare(condition.op, source.attachedDon.length, condition.value),
  };
};

const evaluateSourcePlayedThisTurn = (
  state: GameState,
  entry: EffectQueueEntry,
): ConditionEvaluationResult => {
  const source = findLiveSourceFieldCard(state, entry);
  if (
    source === undefined ||
    source.cardId !== entry.source.cardId ||
    source.controller !== entry.source.playerId ||
    source.zone.zone !== "characterArea"
  ) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: source.turnPlayed === state.turn.globalTurn,
  };
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
):
  | (ResolvedCard & {
      colors: string[];
      types: string[];
      attributes: string[];
    })
  | undefined => {
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
  if (
    stateValue !== undefined &&
    stateValue !== "active" &&
    stateValue !== "rested" &&
    stateValue !== "attached"
  ) {
    return false;
  }
  return true;
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
): filter is { names: string[] } => {
  if (filter === undefined) {
    return false;
  }
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return (
    keys.length === 1 &&
    keys[0] === "names" &&
    Array.isArray(filter.names) &&
    filter.names.length > 0 &&
    filter.names.every((name) => typeof name === "string")
  );
};

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
        if (attachedIds.has(card.instanceId)) {
          continue;
        }
        if (card.state === stateFilter) {
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
    const metadata = state.cardManifest.cards[card.cardId];
    return (
      metadata !== undefined &&
      cardMatchesCharacterFieldCountFilter(metadata, card, filter)
    );
  });
  if (filter.custom === "differentNames") {
    const distinctNames = new Set<string>();
    for (const card of matchingCharacters) {
      const name = state.cardManifest.cards[card.cardId]?.name;
      if (name === undefined) {
        continue;
      }
      distinctNames.add(name);
    }
    return distinctNames.size;
  }
  return matchingCharacters.length;
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
  playerId: PlayerId,
  names: readonly string[],
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
    const metadata = state.cardManifest.cards[card.cardId];
    return metadata !== undefined && cardMatchesAnyName(metadata, names);
  }).length;
};

const evaluateEventHistory = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "eventHistory" }>,
): ConditionEvaluationResult => {
  if (!isSupportedEventHistoryCondition(condition)) {
    return { supported: false };
  }
  const playerId = resolveConditionPlayer(state, entry, condition.player);
  if (playerId === undefined || state.players[playerId] === undefined) {
    return { supported: false };
  }
  const count = countMatchingEventHistory(state, playerId, condition);
  return {
    supported: true,
    passed: compare(condition.op, count, condition.value),
  };
};

const isSupportedOnlyMatchingFieldCardsFilter = (
  filter: CardFilter,
): boolean => {
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return (
    keys.every(
      (key) =>
        key === "categories" || key === "typesAny" || key === "typesIncludeAny",
    ) &&
    Array.isArray(filter.categories) &&
    filter.categories.length === 1 &&
    filter.categories[0] === "character" &&
    ((Array.isArray(filter.typesAny) &&
      filter.typesAny.length > 0 &&
      filter.typesAny.every((value) => typeof value === "string")) ||
      (Array.isArray(filter.typesIncludeAny) &&
        filter.typesIncludeAny.length > 0 &&
        filter.typesIncludeAny.every((value) => typeof value === "string")))
  );
};

const evaluateOnlyMatchingFieldCards = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "onlyMatchingFieldCards" }>,
): ConditionEvaluationResult => {
  if (
    condition.zone !== "characterArea" ||
    !isSupportedOnlyMatchingFieldCardsFilter(condition.filter)
  ) {
    return { supported: false };
  }
  const playerId = resolveConditionPlayer(state, entry, condition.player);
  if (playerId === undefined) {
    return { supported: false };
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: player.characters.every((card) => {
      const metadata = state.cardManifest.cards[card.cardId];
      return (
        metadata !== undefined &&
        cardMatchesCharacterFieldCountFilter(metadata, card, condition.filter)
      );
    }),
  };
};

const evaluateLeaderColorCount = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "leaderColorCount" }>,
): ConditionEvaluationResult => {
  if (!isNonNegativeSafeInteger(condition.value)) {
    return { supported: false };
  }
  if (!isComparator(condition.op)) {
    return { supported: false };
  }
  const playerId = resolveConditionPlayer(state, entry, condition.player);
  if (playerId === undefined) {
    return { supported: false };
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return { supported: false };
  }
  const leader = readLeaderMetadata(state, playerId);
  if (leader === undefined) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: compare(condition.op, leader.colors.length, condition.value),
  };
};

const evaluateCountCondition = (
  state: GameState,
  entry: EffectQueueEntry,
  playerRef: PlayerRef,
  value: number,
  op: Comparator,
  actual: (playerId: PlayerId) => number,
): ConditionEvaluationResult => {
  if (!isNonNegativeSafeInteger(value)) {
    return { supported: false };
  }
  if (!isComparator(op)) {
    return { supported: false };
  }
  const playerId = resolveConditionPlayer(state, entry, playerRef);
  if (playerId === undefined) {
    return { supported: false };
  }
  if (state.players[playerId] === undefined) {
    return { supported: false };
  }
  return { supported: true, passed: compare(op, actual(playerId), value) };
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
  if (isSupportedDonFieldCountFilter(operand.filter)) {
    return {
      supported: true,
      count: countPublicDonOnField(state, playerId, operand.filter.state),
    };
  }
  if (isSupportedCharacterFieldCountFilter(operand.filter)) {
    return {
      supported: true,
      count: countPublicCharactersOnField(
        state,
        entry,
        playerId,
        operand.filter,
      ),
    };
  }
  if (isSupportedPublicFieldStateCountFilter(operand.filter)) {
    return {
      supported: true,
      count: countPublicCardsOnFieldByState(
        state,
        playerId,
        operand.filter.state,
      ),
    };
  }
  if (isSupportedPublicFieldNameCountFilter(operand.filter)) {
    return {
      supported: true,
      count: countPublicCardsOnFieldByName(
        state,
        playerId,
        operand.filter.names,
      ),
    };
  }
  return { supported: false };
};

const evaluateFieldCountDifference = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "fieldCountDifference" }>,
): ConditionEvaluationResult => {
  if (!isNonNegativeSafeInteger(condition.value)) {
    return { supported: false };
  }
  if (!isComparator(condition.op)) {
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
    passed: compare(
      condition.op,
      minuend.count - subtrahend.count,
      condition.value,
    ),
  };
};

const evaluateCondition = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Condition,
  context?: ConditionEvaluationContext,
): ConditionEvaluationResult => {
  switch (condition.type) {
    case "yourTurn":
      return {
        supported: true,
        passed: state.turn.turnPlayerId === entry.controllerId,
      };
    case "opponentTurn":
      return {
        supported: true,
        passed: state.turn.turnPlayerId !== entry.controllerId,
      };
    case "attachedDonCount":
      return evaluateAttachedDonCount(state, entry, condition);
    case "cardStatComparison":
      return evaluateCardStatComparison(state, entry, condition, context);
    case "sourcePlayedThisTurn":
      return evaluateSourcePlayedThisTurn(state, entry);
    case "leaderColorCount":
      return evaluateLeaderColorCount(state, entry, condition);
    case "handCount":
      return evaluateCountCondition(
        state,
        entry,
        condition.player,
        condition.value,
        condition.op,
        (playerId) => state.players[playerId]?.hand.length ?? 0,
      );
    case "deckCount":
      return evaluateCountCondition(
        state,
        entry,
        condition.player,
        condition.value,
        condition.op,
        (playerId) => state.players[playerId]?.deck.length ?? 0,
      );
    case "lifeCount":
      return evaluateCountCondition(
        state,
        entry,
        condition.player,
        condition.value,
        condition.op,
        (playerId) => state.players[playerId]?.life.length ?? 0,
      );
    case "lifeCountDifference":
      return evaluateLifeCountDifference(state, entry, condition);
    case "lifeCountTotal":
      return evaluateLifeCountTotal(state, entry, condition);
    case "turnCount":
      return evaluateCountCondition(
        state,
        entry,
        condition.player,
        condition.value,
        condition.op,
        (playerId) => state.turn.playerTurnCounts[playerId] ?? 0,
      );
    case "trashCount":
      if (
        condition.filter !== undefined &&
        !isSupportedTrashCountFilter(condition.filter)
      ) {
        return { supported: false };
      }
      return evaluateCountCondition(
        state,
        entry,
        condition.player,
        condition.value,
        condition.op,
        (playerId) =>
          condition.filter === undefined
            ? (state.players[playerId]?.trash.length ?? 0)
            : countTrashCardsMatchingFilter(state, playerId, condition.filter),
      );
    case "eventHistory":
      return evaluateEventHistory(state, entry, condition);
    case "fieldCount": {
      if (isSupportedDonFieldCountFilter(condition.filter)) {
        const stateFilter = condition.filter.state;
        return evaluateCountCondition(
          state,
          entry,
          condition.player,
          condition.value,
          condition.op,
          (playerId) => countPublicDonOnField(state, playerId, stateFilter),
        );
      }
      if (isSupportedCharacterFieldCountFilter(condition.filter)) {
        const filter = condition.filter;
        return evaluateCountCondition(
          state,
          entry,
          condition.player,
          condition.value,
          condition.op,
          (playerId) =>
            countPublicCharactersOnField(state, entry, playerId, filter),
        );
      }
      if (isSupportedPublicFieldStateCountFilter(condition.filter)) {
        const stateFilter = condition.filter.state;
        return evaluateCountCondition(
          state,
          entry,
          condition.player,
          condition.value,
          condition.op,
          (playerId) =>
            countPublicCardsOnFieldByState(state, playerId, stateFilter),
        );
      }
      if (isSupportedPublicFieldNameCountFilter(condition.filter)) {
        const names = condition.filter.names;
        return evaluateCountCondition(
          state,
          entry,
          condition.player,
          condition.value,
          condition.op,
          (playerId) => countPublicCardsOnFieldByName(state, playerId, names),
        );
      }
      return { supported: false };
    }
    case "fieldCountDifference":
      return evaluateFieldCountDifference(state, entry, condition);
    case "hasCardInZone":
      return evaluateHasCardInZone(state, entry, condition);
    case "onlyMatchingFieldCards":
      return evaluateOnlyMatchingFieldCards(state, entry, condition);
    case "and": {
      let allPassed = true;
      for (const child of condition.conditions) {
        const childResult = evaluateCondition(state, entry, child, context);
        if (!childResult.supported) {
          return { supported: false };
        }
        allPassed = allPassed && childResult.passed;
      }
      return { supported: true, passed: allPassed };
    }
    case "or": {
      let anyPassed = false;
      for (const child of condition.conditions) {
        const childResult = evaluateCondition(state, entry, child, context);
        if (!childResult.supported) {
          return { supported: false };
        }
        anyPassed = anyPassed || childResult.passed;
      }
      return { supported: true, passed: anyPassed };
    }
    case "not": {
      const childResult = evaluateCondition(
        state,
        entry,
        condition.condition,
        context,
      );
      if (!childResult.supported) {
        return { supported: false };
      }
      return { supported: true, passed: !childResult.passed };
    }
    case "custom":
    case "attackTarget":
    case "donCount":
    case "cardState":
    case "eventPayload":
      return { supported: false };
    case "sourceStillInZone":
      return { supported: false };
    default:
      return { supported: false };
  }
};

export const isSupportedQueuedEffectConditionShape = (
  condition: Condition | undefined,
): boolean => {
  if (condition === undefined) {
    return true;
  }
  switch (condition.type) {
    case "yourTurn":
    case "opponentTurn":
      return true;
    case "attachedDonCount":
      return (
        condition.target.type === "self" &&
        isNonNegativeSafeInteger(condition.value) &&
        isComparator(condition.op)
      );
    case "cardStatComparison":
      return isSupportedCardStatComparisonCondition(condition);
    case "sourcePlayedThisTurn":
      return true;
    case "leaderColorCount":
    case "handCount":
    case "deckCount":
    case "lifeCount":
    case "turnCount":
      return (
        isNonNegativeSafeInteger(condition.value) &&
        isComparator(condition.op) &&
        (condition.player === "self" || condition.player === "opponent")
      );
    case "lifeCountDifference":
      return isSupportedLifeCountDifferenceCondition(condition);
    case "lifeCountTotal":
      return isSupportedLifeCountTotalCondition(condition);
    case "trashCount":
      return (
        (condition.filter === undefined ||
          isSupportedTrashCountFilter(condition.filter)) &&
        isNonNegativeSafeInteger(condition.value) &&
        isComparator(condition.op) &&
        (condition.player === "self" || condition.player === "opponent")
      );
    case "eventHistory":
      return (
        isSupportedEventHistoryCondition(condition) &&
        (condition.player === "self" || condition.player === "opponent")
      );
    case "fieldCount":
      return (
        (isSupportedDonFieldCountFilter(condition.filter) ||
          isSupportedCharacterFieldCountFilter(condition.filter) ||
          isSupportedPublicFieldStateCountFilter(condition.filter) ||
          isSupportedPublicFieldNameCountFilter(condition.filter)) &&
        isNonNegativeSafeInteger(condition.value) &&
        isComparator(condition.op) &&
        (condition.player === "self" || condition.player === "opponent")
      );
    case "fieldCountDifference":
      return (
        (isSupportedDonFieldCountFilter(condition.minuend.filter) ||
          isSupportedCharacterFieldCountFilter(condition.minuend.filter) ||
          isSupportedPublicFieldStateCountFilter(condition.minuend.filter) ||
          isSupportedPublicFieldNameCountFilter(condition.minuend.filter)) &&
        (isSupportedDonFieldCountFilter(condition.subtrahend.filter) ||
          isSupportedCharacterFieldCountFilter(condition.subtrahend.filter) ||
          isSupportedPublicFieldStateCountFilter(condition.subtrahend.filter) ||
          isSupportedPublicFieldNameCountFilter(condition.subtrahend.filter)) &&
        isNonNegativeSafeInteger(condition.value) &&
        isComparator(condition.op) &&
        (condition.minuend.player === "self" ||
          condition.minuend.player === "opponent") &&
        (condition.subtrahend.player === "self" ||
          condition.subtrahend.player === "opponent")
      );
    case "hasCardInZone":
      return (
        condition.zone === "leaderArea" &&
        isSupportedLeaderZoneFilter(condition.filter) &&
        (condition.player === "self" || condition.player === "opponent")
      );
    case "onlyMatchingFieldCards":
      return (
        condition.zone === "characterArea" &&
        (condition.player === "self" || condition.player === "opponent") &&
        isSupportedOnlyMatchingFieldCardsFilter(condition.filter)
      );
    case "and":
    case "or":
      return condition.conditions.every(isSupportedQueuedEffectConditionShape);
    case "not":
      return isSupportedQueuedEffectConditionShape(condition.condition);
    case "custom":
    case "attackTarget":
    case "donCount":
    case "cardState":
    case "eventPayload":
      return false;
    case "sourceStillInZone":
      return false;
    default:
      return false;
  }
};

export const evaluateQueuedEffectCondition = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Condition | undefined,
  context?: ConditionEvaluationContext,
): ConditionEvaluationResult => {
  if (condition === undefined) {
    return { supported: true, passed: true };
  }
  return evaluateCondition(state, entry, condition, context);
};
