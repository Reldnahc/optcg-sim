import type {
  CardFilter,
  Comparator,
  Condition,
  EffectQueueEntry,
  GameState,
  PlayerId,
  PlayerRef,
} from "@optcg/types";

import {
  cardMatchesCharacterFieldCountFilter,
  isSupportedCharacterFieldCountFilter,
} from "./field-count-character-filter.js";
import { computeView } from "../../view/compute-view.js";

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

const isComparator = (value: unknown): value is Comparator =>
  value === "eq" ||
  value === "neq" ||
  value === "gt" ||
  value === "gte" ||
  value === "lt" ||
  value === "lte";

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  Number.isInteger(value) &&
  value >= 0;

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
  return (Object.keys(state.players) as PlayerId[]).find(
    (playerId) => playerId !== entry.controllerId,
  );
};

export const isSupportedFieldStatTotalCondition = (
  condition: Extract<Condition, { type: "fieldStatTotal" }>,
): boolean =>
  isSupportedCharacterFieldCountFilter(condition.filter) &&
  isNonNegativeSafeInteger(condition.value) &&
  isComparator(condition.op) &&
  (condition.player === "self" || condition.player === "opponent");

const totalPublicCharacterFieldStat = (
  state: GameState,
  entry: EffectQueueEntry,
  playerId: PlayerId,
  filter: CardFilter,
  stat: Extract<Condition, { type: "fieldStatTotal" }>["stat"],
): number | undefined => {
  const player = state.players[playerId];
  if (player === undefined) {
    return 0;
  }
  const computedCards =
    stat === "cost"
      ? computeView(state, {
          supportStatusPolicy: "ignore",
          unsupportedCombatKeywordPolicy: "ignore",
        }).cards
      : undefined;
  let total = 0;
  for (const card of player.characters) {
    if (
      filter.excludeSelf === true &&
      card.instanceId === entry.source.instanceId
    ) {
      continue;
    }
    if (
      filter.state !== undefined &&
      filter.state !== "active" &&
      filter.state !== "rested"
    ) {
      return undefined;
    }
    if (filter.state !== undefined && card.state !== filter.state) {
      continue;
    }
    const metadata = state.cardManifest.cards[card.cardId];
    if (metadata === undefined) {
      return undefined;
    }
    if (!cardMatchesCharacterFieldCountFilter(metadata, card, filter)) {
      continue;
    }
    const cost =
      stat === "cost"
        ? (computedCards?.[card.instanceId]?.currentCost ?? metadata.cost)
        : metadata.cost;
    if (cost === undefined) {
      return undefined;
    }
    total += cost;
  }
  return total;
};

export const evaluateFieldStatTotal = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "fieldStatTotal" }>,
): ConditionEvaluationResult => {
  if (!isSupportedFieldStatTotalCondition(condition)) {
    return { supported: false };
  }
  const playerId = resolveConditionPlayer(state, entry, condition.player);
  if (playerId === undefined) {
    return { supported: false };
  }
  const total = totalPublicCharacterFieldStat(
    state,
    entry,
    playerId,
    condition.filter,
    condition.stat,
  );
  if (total === undefined) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: compare(condition.op, total, condition.value),
  };
};
