import type {
  CardFilter,
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

type ConditionEvaluationResult =
  | ConditionEvaluationSuccess
  | ConditionEvaluationFailure;

type SupportedLeaderZoneFilter = Required<Pick<CardFilter, "categories">> &
  Pick<
    CardFilter,
    "typesAny" | "attributesAny" | "names" | "nameContains" | "anyOf"
  >;

type LeaderMetadata = ResolvedCard & {
  colors: string[];
  types: string[];
  attributes: string[];
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

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
): LeaderMetadata | undefined => {
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

export const isSupportedLeaderZoneFilter = (
  filter: CardFilter,
): filter is SupportedLeaderZoneFilter => {
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  for (const key of keys) {
    if (
      key !== "categories" &&
      key !== "typesAny" &&
      key !== "attributesAny" &&
      key !== "names" &&
      key !== "nameContains" &&
      key !== "anyOf"
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
  const hasNameContains =
    typeof filter.nameContains === "string" && filter.nameContains.length > 0;
  const hasAnyOf =
    Array.isArray(filter.anyOf) &&
    filter.anyOf.length > 0 &&
    filter.anyOf.every((branch) =>
      isSupportedLeaderZoneFilter({
        categories: ["leader"],
        ...branch,
      }),
    );
  return hasTypes || hasAttributes || hasNames || hasNameContains || hasAnyOf;
};

const leaderMatchesFilter = (
  leader: LeaderMetadata,
  filter: SupportedLeaderZoneFilter,
): boolean => {
  const typesMatch =
    filter.typesAny === undefined
      ? true
      : filter.typesAny.some((type) => leader.types.includes(type));
  const attributesMatch =
    filter.attributesAny === undefined
      ? true
      : filter.attributesAny.some((attribute) =>
          leader.attributes.includes(attribute),
        );
  const namesMatch =
    filter.names === undefined
      ? true
      : filter.names.some((name) => leader.name === name);
  const nameContainsMatch =
    filter.nameContains === undefined
      ? true
      : leader.name.includes(filter.nameContains);
  const anyOfMatch =
    filter.anyOf === undefined
      ? true
      : filter.anyOf.some((branch) =>
          leaderMatchesFilter(leader, {
            categories: ["leader"],
            ...branch,
          }),
        );
  return (
    typesMatch &&
    attributesMatch &&
    namesMatch &&
    nameContainsMatch &&
    anyOfMatch
  );
};

export const evaluateHasCardInZone = (
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
  if (playerId === undefined || state.players[playerId] === undefined) {
    return { supported: false };
  }
  const leader = readLeaderMetadata(state, playerId);
  if (leader === undefined) {
    return { supported: false };
  }
  return {
    supported: true,
    passed: leaderMatchesFilter(leader, condition.filter),
  };
};
