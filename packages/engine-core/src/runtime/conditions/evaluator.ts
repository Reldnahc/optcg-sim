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

import { cardMatchesCharacterFieldCountFilter } from "./field-count-character-filter.js";
import {
  compareComparator,
  isComparator,
  isNonNegativeSafeInteger,
} from "./comparison.js";
import {
  evaluateFieldCount,
  evaluateFieldCountDifference,
  evaluateFieldCountTotal,
  isSupportedFieldCountCondition,
  isSupportedFieldCountDifferenceCondition,
  isSupportedFieldCountTotalCondition,
} from "./field-count.js";
import {
  evaluateLifeCountDifference,
  evaluateLifeCountTotal,
  evaluateLifeVisibilityCount,
  isSupportedLifeCountDifferenceCondition,
  isSupportedLifeCountTotalCondition,
  isSupportedLifeVisibilityCountCondition,
} from "./life-count.js";
import {
  evaluateHandCount,
  evaluateHandCountDifference,
  isSupportedHandCountCondition,
  isSupportedHandCountDifferenceCondition,
} from "./hand-count.js";
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
import {
  evaluateCardStatComparison,
  isSupportedCardStatComparisonCondition,
  type ConditionEvaluationContext,
} from "./card-stat-comparison.js";
import {
  evaluateCardMatches,
  isSupportedCardMatchesCondition,
} from "./card-matches.js";
import {
  evaluateFieldStatTotal,
  isSupportedFieldStatTotalCondition,
} from "./field-stat-total.js";

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
  const source =
    sourceZone === undefined || !isFieldZone(sourceZone.zone)
      ? undefined
      : findLiveSourceFieldCard(state, entry);
  if (source !== undefined) {
    if (
      source.cardId !== entry.source.cardId ||
      source.controller !== entry.source.playerId ||
      !isFieldZone(source.zone.zone)
    ) {
      return { supported: false };
    }
    return {
      supported: true,
      passed: compareComparator(
        condition.op,
        source.attachedDon.length,
        condition.value,
      ),
    };
  }
  if (entry.sourceSnapshot.attachedDonCount === undefined) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: compareComparator(
      condition.op,
      entry.sourceSnapshot.attachedDonCount,
      condition.value,
    ),
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

const evaluateCardState = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "cardState" }>,
): ConditionEvaluationResult => {
  if (condition.target.type !== "self") {
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
  return { supported: true, passed: source.state === condition.state };
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
  const count = countMatchingEventHistory(state, entry, playerId, condition);
  return {
    supported: true,
    passed: compareComparator(condition.op, count, condition.value),
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
  if (player.characters.length === 0) {
    return { supported: true, passed: false };
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
    passed: compareComparator(
      condition.op,
      leader.colors.length,
      condition.value,
    ),
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
  return {
    supported: true,
    passed: compareComparator(op, actual(playerId), value),
  };
};

const isSupportedZoneCountTotalCondition = (
  condition: Extract<Condition, { type: "zoneCountTotal" }>,
): boolean =>
  isNonNegativeSafeInteger(condition.value) &&
  isComparator(condition.op) &&
  Array.isArray(condition.counts) &&
  condition.counts.length > 0 &&
  condition.counts.every(
    (count) =>
      (count.player === "self" || count.player === "opponent") &&
      count.zone !== "noZone",
  );

const countZone = (
  state: GameState,
  entry: EffectQueueEntry,
  count: Extract<Condition, { type: "zoneCountTotal" }>["counts"][number],
): { supported: true; count: number } | { supported: false } => {
  const playerId = resolveConditionPlayer(state, entry, count.player);
  if (playerId === undefined) {
    return { supported: false };
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return { supported: false };
  }
  switch (count.zone) {
    case "hand":
      return { supported: true, count: player.hand.length };
    case "deck":
      return { supported: true, count: player.deck.length };
    case "trash":
      return { supported: true, count: player.trash.length };
    case "life":
      return { supported: true, count: player.life.length };
    case "costArea":
      return { supported: true, count: player.costArea.length };
    case "donDeck":
      return { supported: true, count: player.donDeck.length };
    case "characterArea":
      return { supported: true, count: player.characters.length };
    case "stageArea":
      return { supported: true, count: player.stage === undefined ? 0 : 1 };
    case "leaderArea":
      return { supported: true, count: 1 };
    case "noZone":
      return { supported: false };
  }
};

const evaluateZoneCountTotal = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "zoneCountTotal" }>,
): ConditionEvaluationResult => {
  if (!isSupportedZoneCountTotalCondition(condition)) {
    return { supported: false };
  }
  let total = 0;
  for (const zoneCount of condition.counts) {
    const counted = countZone(state, entry, zoneCount);
    if (!counted.supported) {
      return { supported: false };
    }
    total += counted.count;
  }
  return {
    supported: true,
    passed: compareComparator(condition.op, total, condition.value),
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
    case "cardMatches":
      return evaluateCardMatches(state, entry, condition, context);
    case "sourcePlayedThisTurn":
      return evaluateSourcePlayedThisTurn(state, entry);
    case "leaderColorCount":
      return evaluateLeaderColorCount(state, entry, condition);
    case "handCount":
      return evaluateHandCount(state, entry, condition);
    case "zoneCountTotal":
      return evaluateZoneCountTotal(state, entry, condition);
    case "handCountDifference":
      return evaluateHandCountDifference(state, entry, condition);
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
    case "lifeVisibilityCount":
      return evaluateLifeVisibilityCount(state, entry, condition);
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
    case "fieldCount":
      return evaluateFieldCount(state, entry, condition);
    case "fieldCountTotal":
      return evaluateFieldCountTotal(state, entry, condition);
    case "fieldCountDifference":
      return evaluateFieldCountDifference(state, entry, condition);
    case "fieldStatTotal":
      return evaluateFieldStatTotal(state, entry, condition);
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
    case "cardState":
      return evaluateCardState(state, entry, condition);
    case "custom":
    case "attackTarget":
    case "donCount":
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
    case "cardMatches":
      return isSupportedCardMatchesCondition(condition);
    case "sourcePlayedThisTurn":
      return true;
    case "leaderColorCount":
    case "deckCount":
    case "lifeCount":
    case "turnCount":
      return (
        isNonNegativeSafeInteger(condition.value) &&
        isComparator(condition.op) &&
        (condition.player === "self" || condition.player === "opponent")
      );
    case "handCount":
      return isSupportedHandCountCondition(condition);
    case "zoneCountTotal":
      return isSupportedZoneCountTotalCondition(condition);
    case "handCountDifference":
      return isSupportedHandCountDifferenceCondition(condition);
    case "lifeCountDifference":
      return isSupportedLifeCountDifferenceCondition(condition);
    case "lifeCountTotal":
      return isSupportedLifeCountTotalCondition(condition);
    case "lifeVisibilityCount":
      return isSupportedLifeVisibilityCountCondition(condition);
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
      return isSupportedFieldCountCondition(condition);
    case "fieldCountTotal":
      return isSupportedFieldCountTotalCondition(condition);
    case "fieldCountDifference":
      return isSupportedFieldCountDifferenceCondition(condition);
    case "fieldStatTotal":
      return isSupportedFieldStatTotalCondition(condition);
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
    case "cardState":
      return condition.target.type === "self";
    case "custom":
    case "attackTarget":
    case "donCount":
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
