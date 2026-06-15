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
  return playerIds.find((playerId) => playerId !== entry.controllerId);
};

export const isSupportedHandCountCondition = (
  condition: Extract<Condition, { type: "handCount" }>,
): boolean =>
  isNonNegativeSafeInteger(condition.value) &&
  isComparator(condition.op) &&
  (condition.player === "self" || condition.player === "opponent");

export const evaluateHandCount = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "handCount" }>,
): ConditionEvaluationResult => {
  if (!isSupportedHandCountCondition(condition)) {
    return { supported: false };
  }
  const playerId = resolveConditionPlayer(state, entry, condition.player);
  if (playerId === undefined || state.players[playerId] === undefined) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: compare(
      condition.op,
      state.players[playerId].hand.length,
      condition.value,
    ),
  };
};

const countHandOperand = (
  state: GameState,
  entry: EffectQueueEntry,
  operand: {
    player: PlayerRef;
  },
): { supported: true; count: number } | { supported: false } => {
  const playerId = resolveConditionPlayer(state, entry, operand.player);
  if (playerId === undefined || state.players[playerId] === undefined) {
    return { supported: false };
  }
  return { supported: true, count: state.players[playerId].hand.length };
};

const isSupportedHandCountOperand = (operand: { player: PlayerRef }): boolean =>
  operand.player === "self" || operand.player === "opponent";

export const isSupportedHandCountDifferenceCondition = (
  condition: Extract<Condition, { type: "handCountDifference" }>,
): boolean =>
  isSupportedHandCountOperand(condition.minuend) &&
  isSupportedHandCountOperand(condition.subtrahend) &&
  isNonNegativeSafeInteger(condition.value) &&
  isComparator(condition.op);

export const evaluateHandCountDifference = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Extract<Condition, { type: "handCountDifference" }>,
): ConditionEvaluationResult => {
  if (!isSupportedHandCountDifferenceCondition(condition)) {
    return { supported: false };
  }
  const minuend = countHandOperand(state, entry, condition.minuend);
  const subtrahend = countHandOperand(state, entry, condition.subtrahend);
  if (!minuend.supported || !subtrahend.supported) {
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
