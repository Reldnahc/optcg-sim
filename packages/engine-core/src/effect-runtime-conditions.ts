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

const isSupportedLeaderZoneFilter = (
  filter: CardFilter,
): filter is Required<Pick<CardFilter, "categories">> &
  Pick<CardFilter, "typesAny" | "attributesAny"> => {
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  for (const key of keys) {
    if (key !== "categories" && key !== "typesAny" && key !== "attributesAny") {
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
  const hasAttributes =
    Array.isArray(filter.attributesAny) &&
    filter.attributesAny.length > 0 &&
    filter.attributesAny.every((value) => typeof value === "string");
  return hasTypes || hasAttributes;
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

const evaluateHasCardInZone = (
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
  if (playerId === undefined) {
    return { supported: false };
  }
  const leader = readLeaderMetadata(state, playerId);
  if (leader === undefined) {
    return { supported: false };
  }
  const typesMatch =
    condition.filter.typesAny === undefined
      ? true
      : condition.filter.typesAny.some((type) => leader.types.includes(type));
  const attributesMatch =
    condition.filter.attributesAny === undefined
      ? true
      : condition.filter.attributesAny.some((attribute) =>
          leader.attributes.includes(attribute),
        );
  return { supported: true, passed: typesMatch && attributesMatch };
};

const evaluateCondition = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Condition,
): ConditionEvaluationResult => {
  switch (condition.type) {
    case "yourTurn":
      return {
        supported: true,
        passed: state.turn.turnPlayerId === entry.controllerId,
      };
    case "attachedDonCount":
      return evaluateAttachedDonCount(state, entry, condition);
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
    case "lifeCount":
      return evaluateCountCondition(
        state,
        entry,
        condition.player,
        condition.value,
        condition.op,
        (playerId) => state.players[playerId]?.life.length ?? 0,
      );
    case "hasCardInZone":
      return evaluateHasCardInZone(state, entry, condition);
    case "and": {
      let allPassed = true;
      for (const child of condition.conditions) {
        const childResult = evaluateCondition(state, entry, child);
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
        const childResult = evaluateCondition(state, entry, child);
        if (!childResult.supported) {
          return { supported: false };
        }
        anyPassed = anyPassed || childResult.passed;
      }
      return { supported: true, passed: anyPassed };
    }
    case "not": {
      const childResult = evaluateCondition(state, entry, condition.condition);
      if (!childResult.supported) {
        return { supported: false };
      }
      return { supported: true, passed: !childResult.passed };
    }
    case "custom":
    case "attackTarget":
    case "donCount":
    case "opponentTurn":
    case "fieldCount":
    case "trashCount":
    case "cardState":
    case "sourceStillInZone":
    case "eventPayload":
      return { supported: false };
    default:
      return { supported: false };
  }
};

export const evaluateQueuedEffectCondition = (
  state: GameState,
  entry: EffectQueueEntry,
  condition: Condition | undefined,
): ConditionEvaluationResult => {
  if (condition === undefined) {
    return { supported: true, passed: true };
  }
  return evaluateCondition(state, entry, condition);
};
