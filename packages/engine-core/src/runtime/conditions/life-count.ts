import type {
  Comparator,
  Condition,
  EffectQueueEntry,
  GameState,
  PlayerId,
  PlayerRef,
} from "@optcg/types";

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

const countLifeOperand = (
  state: GameState,
  entry: EffectQueueEntry,
  operand: { player: PlayerRef },
): { supported: true; count: number } | { supported: false } => {
  const playerId = resolveConditionPlayer(state, entry, operand.player);
  if (playerId === undefined) {
    return { supported: false };
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return { supported: false };
  }
  return { supported: true, count: player.life.length };
};

export const evaluateLifeCountDifference = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "lifeCountDifference" }>,
): ConditionEvaluationResult => {
  if (!isSupportedLifeCountDifferenceCondition(condition)) {
    return { supported: false };
  }
  const minuend = countLifeOperand(state, entry, condition.minuend);
  if (!minuend.supported) {
    return { supported: false };
  }
  const subtrahend = countLifeOperand(state, entry, condition.subtrahend);
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

export const evaluateLifeCountTotal = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "lifeCountTotal" }>,
): ConditionEvaluationResult => {
  if (!isSupportedLifeCountTotalCondition(condition)) {
    return { supported: false };
  }
  let total = 0;
  for (const player of condition.players) {
    const operand = countLifeOperand(state, entry, { player });
    if (!operand.supported) {
      return { supported: false };
    }
    total += operand.count;
  }
  return {
    supported: true,
    passed: compare(condition.op, total, condition.value),
  };
};

export const evaluateLifeVisibilityCount = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "lifeVisibilityCount" }>,
): ConditionEvaluationResult => {
  if (!isSupportedLifeVisibilityCountCondition(condition)) {
    return { supported: false };
  }
  const player = countLifeVisibilityOperand(state, entry, condition);
  if (!player.supported) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: compare(condition.op, player.count, condition.value),
  };
};

const countLifeVisibilityOperand = (
  state: GameState,
  entry: EffectQueueEntry,
  operand: { player: PlayerRef; faceUp: boolean },
): { supported: true; count: number } | { supported: false } => {
  const playerId = resolveConditionPlayer(state, entry, operand.player);
  if (playerId === undefined) {
    return { supported: false };
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return { supported: false };
  }
  return {
    supported: true,
    count: player.life.filter((lifeCard) => lifeCard.faceUp === operand.faceUp)
      .length,
  };
};

export const isSupportedLifeCountDifferenceCondition = (
  condition: Extract<Condition, { type: "lifeCountDifference" }>,
): boolean =>
  isNonNegativeSafeInteger(condition.value) &&
  isComparator(condition.op) &&
  (condition.minuend.player === "self" ||
    condition.minuend.player === "opponent") &&
  (condition.subtrahend.player === "self" ||
    condition.subtrahend.player === "opponent");

export const isSupportedLifeCountTotalCondition = (
  condition: Extract<Condition, { type: "lifeCountTotal" }>,
): boolean =>
  isNonNegativeSafeInteger(condition.value) &&
  isComparator(condition.op) &&
  Array.isArray(condition.players) &&
  condition.players.length > 0 &&
  condition.players.every(
    (player) => player === "self" || player === "opponent",
  );

export const isSupportedLifeVisibilityCountCondition = (
  condition: Extract<Condition, { type: "lifeVisibilityCount" }>,
): boolean =>
  isNonNegativeSafeInteger(condition.value) &&
  isComparator(condition.op) &&
  (condition.player === "self" || condition.player === "opponent");
