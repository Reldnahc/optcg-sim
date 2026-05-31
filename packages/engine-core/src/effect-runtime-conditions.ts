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
  Pick<CardFilter, "typesAny" | "attributesAny" | "names"> => {
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  for (const key of keys) {
    if (
      key !== "categories" &&
      key !== "typesAny" &&
      key !== "attributesAny" &&
      key !== "names"
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
  const hasAttributes =
    Array.isArray(filter.attributesAny) &&
    filter.attributesAny.length > 0 &&
    filter.attributesAny.every((value) => typeof value === "string");
  const hasNames =
    Array.isArray(filter.names) &&
    filter.names.length > 0 &&
    filter.names.every((value) => typeof value === "string");
  return hasTypes || hasAttributes || hasNames;
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

const isSupportedCharacterFieldCountFilter = (
  filter: CardFilter | undefined,
): filter is Required<Pick<CardFilter, "categories">> & {
  state?: "active" | "rested";
  names?: string[];
  typesAny?: string[];
  excludeSelf?: boolean;
} => {
  if (filter === undefined) {
    return false;
  }
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  for (const key of keys) {
    if (
      key !== "categories" &&
      key !== "state" &&
      key !== "names" &&
      key !== "typesAny" &&
      key !== "excludeSelf"
    ) {
      return false;
    }
  }
  if (
    !Array.isArray(filter.categories) ||
    filter.categories.length !== 1 ||
    filter.categories[0] !== "character"
  ) {
    return false;
  }
  const stateValue = filter.state as unknown;
  const namesValue = filter.names as unknown;
  const typesValue = filter.typesAny as unknown;
  const excludeSelfValue = filter.excludeSelf as unknown;
  return (
    (stateValue === undefined ||
      stateValue === "active" ||
      stateValue === "rested") &&
    (namesValue === undefined ||
      (Array.isArray(namesValue) &&
        namesValue.length > 0 &&
        namesValue.every((value) => typeof value === "string"))) &&
    (typesValue === undefined ||
      (Array.isArray(typesValue) &&
        typesValue.length > 0 &&
        typesValue.every((value) => typeof value === "string"))) &&
    (excludeSelfValue === undefined || excludeSelfValue === true)
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
  return player.characters.filter((card) => {
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
    if (filter.names === undefined && filter.typesAny === undefined) {
      return true;
    }
    return cardMatchesFilter(state, card, filter);
  }).length;
};

const cardMatchesFilter = (
  state: GameState,
  card: CardInstance,
  filter: CardFilter,
): boolean => {
  const metadata = state.cardManifest.cards[card.cardId];
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
    filter.typesAny !== undefined &&
    !filter.typesAny.some((typeName) => metadata.types.includes(typeName))
  ) {
    return false;
  }
  if (
    filter.names !== undefined &&
    !filter.names.some((name) => metadata.name === name)
  ) {
    return false;
  }
  return true;
};

const isSupportedTrashCountFilter = (filter: CardFilter): boolean => {
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return (
    keys.every((key) => key === "categories") &&
    Array.isArray(filter.categories) &&
    filter.categories.length > 0 &&
    filter.categories.every(
      (category) =>
        category === "character" ||
        category === "event" ||
        category === "stage" ||
        category === "leader",
    )
  );
};

const countTrashCardsMatchingFilter = (
  state: GameState,
  playerId: PlayerId,
  filter: CardFilter,
): number => {
  const player = state.players[playerId];
  if (player === undefined) {
    return 0;
  }
  return player.trash.filter((card) => cardMatchesFilter(state, card, filter))
    .length;
};

const isSupportedOnlyMatchingFieldCardsFilter = (
  filter: CardFilter,
): boolean => {
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return (
    keys.every((key) => key === "categories" || key === "typesAny") &&
    Array.isArray(filter.categories) &&
    filter.categories.length === 1 &&
    filter.categories[0] === "character" &&
    Array.isArray(filter.typesAny) &&
    filter.typesAny.length > 0 &&
    filter.typesAny.every((value) => typeof value === "string")
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
    passed: player.characters.every((card) =>
      cardMatchesFilter(state, card, condition.filter),
    ),
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
  const namesMatch =
    condition.filter.names === undefined
      ? true
      : condition.filter.names.some((name) => leader.name === name);
  return {
    supported: true,
    passed: typesMatch && attributesMatch && namesMatch,
  };
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
    case "opponentTurn":
      return {
        supported: true,
        passed: state.turn.turnPlayerId !== entry.controllerId,
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
    case "cardState":
    case "sourceStillInZone":
    case "eventPayload":
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
    case "leaderColorCount":
    case "handCount":
    case "lifeCount":
    case "turnCount":
      return (
        isNonNegativeSafeInteger(condition.value) &&
        isComparator(condition.op) &&
        (condition.player === "self" || condition.player === "opponent")
      );
    case "trashCount":
      return (
        (condition.filter === undefined ||
          isSupportedTrashCountFilter(condition.filter)) &&
        isNonNegativeSafeInteger(condition.value) &&
        isComparator(condition.op) &&
        (condition.player === "self" || condition.player === "opponent")
      );
    case "fieldCount":
      return (
        (isSupportedDonFieldCountFilter(condition.filter) ||
          isSupportedCharacterFieldCountFilter(condition.filter)) &&
        isNonNegativeSafeInteger(condition.value) &&
        isComparator(condition.op) &&
        (condition.player === "self" || condition.player === "opponent")
      );
    case "fieldCountDifference":
      return (
        (isSupportedDonFieldCountFilter(condition.minuend.filter) ||
          isSupportedCharacterFieldCountFilter(condition.minuend.filter)) &&
        (isSupportedDonFieldCountFilter(condition.subtrahend.filter) ||
          isSupportedCharacterFieldCountFilter(condition.subtrahend.filter)) &&
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
    case "sourceStillInZone":
    case "eventPayload":
      return false;
    default:
      return false;
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
