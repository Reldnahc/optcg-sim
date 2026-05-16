import type {
  CardInstance,
  Comparator,
  Condition,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

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

const isFieldZone = (zone: CardInstance["zone"]["zone"]): boolean =>
  zone === "leaderArea" || zone === "characterArea" || zone === "stageArea";

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

export const evaluateQueuedEffectCondition = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Condition | undefined,
): ConditionEvaluationResult => {
  if (condition === undefined) {
    return { supported: true, passed: true };
  }
  switch (condition.type) {
    case "yourTurn":
      return {
        supported: true,
        passed: state.turn.turnPlayerId === entry.controllerId,
      };
    case "attachedDonCount":
      return evaluateAttachedDonCount(state, entry, condition);
    case "custom":
    case "attackTarget":
    case "donCount":
    case "opponentTurn":
    case "lifeCount":
    case "fieldCount":
    case "handCount":
    case "trashCount":
    case "hasCardInZone":
    case "cardState":
    case "sourceStillInZone":
    case "eventPayload":
    case "and":
    case "or":
    case "not":
      return { supported: false };
    default:
      return { supported: false };
  }
};
