import type {
  CardFilter,
  CardInstance,
  CardStatComparison,
  DynamicNumberValue,
  GameState,
  MultiZoneTargetRequest,
  PlayerId,
  PlayerRef,
  ResolvedCard,
  CardRef,
  TargetCandidate,
  TargetRequest,
  Zone,
} from "@optcg/types";

import { getOpponentId, toCardRef } from "../actions/state.js";
import { cardMatchesAnyName } from "../card-name-matching.js";
import { computeView } from "../view/compute-view.js";

export type TargetCandidateResolutionErrorReason =
  | "invalidTargetCount"
  | "ambiguousCandidateVisibility"
  | "privateCandidateVisibilityUnsupported"
  | "unsupportedZone"
  | "unresolvedPlayerRef"
  | "unsupportedFilter"
  | "missingCardMetadata";

export type TargetCandidateResolutionResult =
  | { ok: true; candidates: TargetCandidate[] }
  | { ok: false; reason: TargetCandidateResolutionErrorReason };

export interface ResolvePublicTargetCandidatesContext {
  sourceControllerId: PlayerId;
  source?: CardRef;
}

const publicCandidateVisibility = { type: "public" } as const;

const supportedFilterKeys = new Set<keyof CardFilter>([
  "anyOf",
  "attributesAny",
  "attributesNotAny",
  "attachedDon",
  "baseCost",
  "categories",
  "colorsAny",
  "cost",
  "currentPower",
  "effectEntryPoint",
  "excludeSelf",
  "names",
  "nameNot",
  "power",
  "state",
  "statComparisons",
  "typesAny",
  "typesIncludeAny",
  "typesNotIncludeAny",
]);

const supportedZones = new Set<Zone>([
  "leaderArea",
  "characterArea",
  "stageArea",
  "costArea",
]);

const isValidTargetCount = (request: TargetRequest): boolean =>
  Number.isInteger(request.min) &&
  Number.isInteger(request.max) &&
  request.min >= 0 &&
  request.max >= 0 &&
  request.min <= request.max;

const isMultiZoneTargetRequest = (
  request: TargetRequest | MultiZoneTargetRequest,
): request is MultiZoneTargetRequest => "zones" in request;

const resolvePlayerRef = (
  state: GameState,
  ref: PlayerRef,
  context: ResolvePublicTargetCandidatesContext,
): PlayerId | null => {
  if (ref === "self") {
    return Object.hasOwn(state.players, context.sourceControllerId)
      ? context.sourceControllerId
      : null;
  }

  if (ref === "opponent") {
    return Object.hasOwn(state.players, context.sourceControllerId)
      ? getOpponentId(state, context.sourceControllerId)
      : null;
  }

  if (ref === "turnPlayer") {
    return Object.hasOwn(state.players, state.turn.turnPlayerId)
      ? state.turn.turnPlayerId
      : null;
  }

  if (ref === "nonTurnPlayer") {
    return Object.hasOwn(state.players, state.turn.turnPlayerId)
      ? getOpponentId(state, state.turn.turnPlayerId)
      : null;
  }

  return null;
};

const resolveTargetPlayerIds = (
  state: GameState,
  ref: TargetRequest["player"],
  context: ResolvePublicTargetCandidatesContext,
): PlayerId[] | null => {
  if (ref !== "anyPlayer") {
    const playerId = resolvePlayerRef(state, ref, context);
    return playerId === null ? null : [playerId];
  }

  if (!Object.hasOwn(state.players, context.sourceControllerId)) {
    return null;
  }
  const opponentId = getOpponentId(state, context.sourceControllerId);
  return opponentId === null ? null : [context.sourceControllerId, opponentId];
};

const hasOnlySupportedFilterKeys = (filter: CardFilter): boolean =>
  Object.keys(filter).every((key) =>
    supportedFilterKeys.has(key as keyof CardFilter),
  );

const hasSupportedNumericFilter = (
  filter:
    | CardFilter["baseCost"]
    | CardFilter["attachedDon"]
    | CardFilter["cost"]
    | CardFilter["power"]
    | CardFilter["currentPower"],
): boolean => {
  if (filter === undefined) {
    return true;
  }

  if ("op" in filter) {
    return filter.op === "eq" && Number.isFinite(filter.value);
  }

  return (
    (filter.min === undefined || Number.isFinite(filter.min)) &&
    (filter.max === undefined || Number.isFinite(filter.max)) &&
    (filter.min === undefined ||
      filter.max === undefined ||
      filter.min <= filter.max)
  );
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isSupportedEffectEntryPointFilter = (
  filter: CardFilter["effectEntryPoint"],
): boolean => filter === undefined || typeof filter.trigger.type === "string";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSupportedDynamicFilterValue = (value: unknown): boolean => {
  if (!isRecord(value) || value["type"] !== "countMatchingZoneCards") {
    return false;
  }
  return (
    value["zone"] === "life" &&
    value["filter"] === undefined &&
    (value["player"] === "self" || value["player"] === "opponent") &&
    Number.isSafeInteger(value["per"]) &&
    Number(value["per"]) > 0 &&
    Number.isSafeInteger(value["multiplier"])
  );
};

const isSupportedStatComparison = (
  comparison: unknown,
): comparison is CardStatComparison => {
  if (!isRecord(comparison)) {
    return false;
  }
  const stat = comparison["stat"];
  const op = comparison["op"];
  return (
    (stat === "cost" ||
      stat === "baseCost" ||
      stat === "power" ||
      stat === "currentPower" ||
      stat === "attachedDon") &&
    (op === "eq" ||
      op === "neq" ||
      op === "gt" ||
      op === "gte" ||
      op === "lt" ||
      op === "lte") &&
    isSupportedDynamicFilterValue(comparison["value"])
  );
};

const isSupportedFilter = (filter: CardFilter | undefined): boolean =>
  filter === undefined ||
  (hasOnlySupportedFilterKeys(filter) &&
    (filter.anyOf === undefined ||
      (filter.anyOf.length > 0 && filter.anyOf.every(isSupportedFilter))) &&
    (filter.attributesAny === undefined ||
      isStringArray(filter.attributesAny)) &&
    (filter.attributesNotAny === undefined ||
      isStringArray(filter.attributesNotAny)) &&
    (filter.categories === undefined || isStringArray(filter.categories)) &&
    (filter.colorsAny === undefined || isStringArray(filter.colorsAny)) &&
    (filter.names === undefined || isStringArray(filter.names)) &&
    (filter.nameNot === undefined || isStringArray(filter.nameNot)) &&
    (filter.typesAny === undefined || isStringArray(filter.typesAny)) &&
    (filter.typesIncludeAny === undefined ||
      isStringArray(filter.typesIncludeAny)) &&
    (filter.typesNotIncludeAny === undefined ||
      isStringArray(filter.typesNotIncludeAny)) &&
    isSupportedEffectEntryPointFilter(filter.effectEntryPoint) &&
    (filter.excludeSelf === undefined || filter.excludeSelf) &&
    (filter.state === undefined ||
      filter.state === "active" ||
      filter.state === "rested") &&
    (filter.statComparisons === undefined ||
      (filter.statComparisons.length > 0 &&
        filter.statComparisons.every(isSupportedStatComparison))) &&
    hasSupportedNumericFilter(filter.baseCost) &&
    hasSupportedNumericFilter(filter.attachedDon) &&
    hasSupportedNumericFilter(filter.cost) &&
    hasSupportedNumericFilter(filter.power) &&
    hasSupportedNumericFilter(filter.currentPower));

const numericFilterMatches = (
  value: number | undefined,
  filter:
    | CardFilter["baseCost"]
    | CardFilter["cost"]
    | CardFilter["power"]
    | CardFilter["currentPower"],
): boolean => {
  if (filter === undefined) {
    return true;
  }

  if (value === undefined) {
    return false;
  }

  if ("op" in filter) {
    return value === filter.value;
  }

  if (filter.min !== undefined && value < filter.min) {
    return false;
  }

  if (filter.max !== undefined && value > filter.max) {
    return false;
  }

  return true;
};

const compare = (op: CardStatComparison["op"], left: number, right: number) => {
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

const resolveDynamicFilterValue = (
  state: GameState,
  value: DynamicNumberValue,
  context: ResolvePublicTargetCandidatesContext,
): number | undefined => {
  if (
    value.type !== "countMatchingZoneCards" ||
    value.zone !== "life" ||
    value.filter !== undefined ||
    !Number.isSafeInteger(value.per) ||
    value.per <= 0 ||
    !Number.isSafeInteger(value.multiplier)
  ) {
    return undefined;
  }
  const playerId = resolvePlayerRef(state, value.player, context);
  const player = playerId === null ? undefined : state.players[playerId];
  if (player === undefined) {
    return undefined;
  }
  return Math.floor(player.life.length / value.per) * value.multiplier;
};

const statComparisonsNeedComputedView = (
  comparisons: readonly CardStatComparison[] | undefined,
): boolean =>
  comparisons?.some(
    (comparison) =>
      comparison.stat === "cost" || comparison.stat === "currentPower",
  ) ?? false;

const statValueForComparison = (
  comparison: CardStatComparison,
  instance: CardInstance,
  card: ResolvedCard,
  computedCard: ReturnType<typeof computedCardViewFor> | undefined,
): number | undefined => {
  switch (comparison.stat) {
    case "cost":
      return computedCard?.currentCost ?? card.cost;
    case "baseCost":
      return card.cost;
    case "power":
      return card.power;
    case "currentPower":
      return computedCard?.currentPower ?? card.power;
    case "attachedDon":
      return instance.attachedDon.length;
  }
};

const statComparisonsMatch = (
  state: GameState,
  instance: CardInstance,
  card: ResolvedCard,
  computedCard: ReturnType<typeof computedCardViewFor> | undefined,
  comparisons: readonly CardStatComparison[] | undefined,
  context: ResolvePublicTargetCandidatesContext,
): boolean => {
  if (comparisons === undefined) {
    return true;
  }
  for (const comparison of comparisons) {
    const left = statValueForComparison(
      comparison,
      instance,
      card,
      computedCard,
    );
    const right = resolveDynamicFilterValue(state, comparison.value, context);
    if (left === undefined || right === undefined) {
      return false;
    }
    if (!compare(comparison.op, left, right)) {
      return false;
    }
  }
  return true;
};

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const cardHasKnownEffectEntryPoint = (
  state: GameState,
  card: ResolvedCard,
  filter: NonNullable<CardFilter["effectEntryPoint"]>,
): boolean => {
  const effectDefinitionId =
    card.support.status === "implemented-dsl"
      ? card.support.effectDefinitionId
      : undefined;
  if (effectDefinitionId === undefined) {
    return false;
  }

  const definition = state.cardManifest.effectDefinitions?.[effectDefinitionId];
  if (definition === undefined) {
    return false;
  }

  return definition.effects.some(
    (effect) =>
      valuesEqual(effect.trigger, filter.trigger) &&
      valuesEqual(effect.condition, filter.condition),
  );
};

const cardMatchesEffectEntryPointFilter = (
  state: GameState,
  card: ResolvedCard,
  filter: CardFilter["effectEntryPoint"],
): boolean => {
  if (filter === undefined) {
    return true;
  }

  const hasEntryPoint = cardHasKnownEffectEntryPoint(state, card, filter);
  return filter.mode === "with" ? hasEntryPoint : !hasEntryPoint;
};

const computedCardViewFor = (state: GameState, instance: CardInstance) =>
  computeView(state, {
    supportStatusPolicy: "ignore",
    unsupportedCombatKeywordPolicy: "ignore",
  }).cards[instance.instanceId];

const cardMatchesFilter = (
  state: GameState,
  instance: CardInstance,
  card: ResolvedCard,
  filter: CardFilter | undefined,
  context: ResolvePublicTargetCandidatesContext,
): boolean => {
  if (filter === undefined) {
    return true;
  }

  if (
    filter.excludeSelf === true &&
    (context.source === undefined ||
      context.source.instanceId === instance.instanceId)
  ) {
    return false;
  }

  if (
    filter.anyOf !== undefined &&
    !filter.anyOf.some((candidate) =>
      cardMatchesFilter(state, instance, card, candidate, context),
    )
  ) {
    return false;
  }
  if (
    filter.categories !== undefined &&
    !filter.categories.includes(card.category)
  ) {
    return false;
  }
  if (
    filter.colorsAny !== undefined &&
    !filter.colorsAny.some((color) => card.colors.includes(color))
  ) {
    return false;
  }
  if (
    filter.typesAny !== undefined &&
    !filter.typesAny.some((type) => card.types.includes(type))
  ) {
    return false;
  }
  if (
    filter.typesIncludeAny !== undefined &&
    !filter.typesIncludeAny.some((typeText) =>
      card.types.some((type) => type.includes(typeText)),
    )
  ) {
    return false;
  }
  if (
    filter.typesNotIncludeAny !== undefined &&
    filter.typesNotIncludeAny.some((typeText) =>
      card.types.some((type) => type.includes(typeText)),
    )
  ) {
    return false;
  }
  if (
    filter.attributesAny !== undefined &&
    !filter.attributesAny.some((attribute) =>
      card.attributes.includes(attribute),
    )
  ) {
    return false;
  }
  if (
    filter.attributesNotAny !== undefined &&
    filter.attributesNotAny.some((attribute) =>
      card.attributes.includes(attribute),
    )
  ) {
    return false;
  }
  if (filter.names !== undefined && !cardMatchesAnyName(card, filter.names)) {
    return false;
  }
  if (
    filter.nameNot !== undefined &&
    cardMatchesAnyName(card, filter.nameNot)
  ) {
    return false;
  }
  if (filter.state !== undefined && instance.state !== filter.state) {
    return false;
  }
  if (
    !cardMatchesEffectEntryPointFilter(state, card, filter.effectEntryPoint)
  ) {
    return false;
  }

  const computedCard =
    state.continuousEffects.length > 0 &&
    (filter.cost !== undefined ||
      filter.currentPower !== undefined ||
      statComparisonsNeedComputedView(filter.statComparisons))
      ? computedCardViewFor(state, instance)
      : undefined;

  if (!numericFilterMatches(card.cost, filter.baseCost)) {
    return false;
  }
  if (!numericFilterMatches(instance.attachedDon.length, filter.attachedDon)) {
    return false;
  }
  if (
    !numericFilterMatches(computedCard?.currentCost ?? card.cost, filter.cost)
  ) {
    return false;
  }
  if (!numericFilterMatches(card.power, filter.power)) {
    return false;
  }
  if (
    !numericFilterMatches(
      computedCard?.currentPower ?? card.power,
      filter.currentPower,
    )
  ) {
    return false;
  }
  return statComparisonsMatch(
    state,
    instance,
    card,
    computedCard,
    filter.statComparisons,
    context,
  );
};

const candidateCardsForZone = (
  state: GameState,
  playerId: PlayerId,
  zone: Zone,
): CardInstance[] | null => {
  const player = state.players[playerId];
  if (player === undefined) {
    return null;
  }

  if (zone === "leaderArea") {
    return [player.leader];
  }

  if (zone === "characterArea") {
    return player.characters;
  }
  if (zone === "stageArea") {
    return player.stage === undefined ? [] : [player.stage];
  }
  if (zone === "costArea") {
    return player.costArea;
  }

  return null;
};

export const resolvePublicTargetCandidates = (
  state: GameState,
  request: TargetRequest,
  context: ResolvePublicTargetCandidatesContext,
): TargetCandidateResolutionResult => {
  if (!isValidTargetCount(request)) {
    return { ok: false, reason: "invalidTargetCount" };
  }

  if (request.visibility === undefined) {
    return { ok: false, reason: "ambiguousCandidateVisibility" };
  }

  if (request.visibility === "privateToChooser") {
    return { ok: false, reason: "privateCandidateVisibilityUnsupported" };
  }

  if (!supportedZones.has(request.zone)) {
    return { ok: false, reason: "unsupportedZone" };
  }

  if (!isSupportedFilter(request.filter)) {
    return { ok: false, reason: "unsupportedFilter" };
  }

  const chooserId = resolvePlayerRef(state, request.chooser, context);
  const targetPlayerIds = resolveTargetPlayerIds(
    state,
    request.player,
    context,
  );
  if (chooserId === null || targetPlayerIds === null) {
    return { ok: false, reason: "unresolvedPlayerRef" };
  }

  const candidates: TargetCandidate[] = [];
  for (const targetPlayerId of targetPlayerIds) {
    const cards = candidateCardsForZone(state, targetPlayerId, request.zone);
    if (cards === null) {
      return { ok: false, reason: "unresolvedPlayerRef" };
    }

    for (const card of cards) {
      const metadata = state.cardManifest.cards[card.cardId];
      if (request.filter !== undefined && metadata === undefined) {
        return { ok: false, reason: "missingCardMetadata" };
      }

      if (
        metadata === undefined ||
        cardMatchesFilter(state, card, metadata, request.filter, context)
      ) {
        candidates.push({
          card: toCardRef(card, targetPlayerId),
          visibility: publicCandidateVisibility,
        });
      }
    }
  }

  return { ok: true, candidates };
};

export const resolvePublicTargetCandidatesForRequest = (
  state: GameState,
  request: TargetRequest | MultiZoneTargetRequest,
  context: ResolvePublicTargetCandidatesContext,
): TargetCandidateResolutionResult => {
  if (!isMultiZoneTargetRequest(request)) {
    return resolvePublicTargetCandidates(state, request, context);
  }
  if (request.zones.length === 0) {
    return { ok: false, reason: "unsupportedZone" };
  }

  const candidates: TargetCandidate[] = [];
  for (const zone of request.zones) {
    const resolved = resolvePublicTargetCandidates(
      state,
      { ...request, zone },
      context,
    );
    if (!resolved.ok) {
      return resolved;
    }
    candidates.push(...resolved.candidates);
  }
  return { ok: true, candidates };
};
