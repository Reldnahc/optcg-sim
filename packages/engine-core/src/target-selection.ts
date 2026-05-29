import type {
  CardFilter,
  CardInstance,
  GameState,
  MultiZoneTargetRequest,
  PlayerId,
  PlayerRef,
  ResolvedCard,
  TargetCandidate,
  TargetRequest,
  Zone,
} from "@optcg/types";

import { getOpponentId, toCardRef } from "./action-state.js";
import { computeView } from "./compute-view.js";

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
}

const publicCandidateVisibility = { type: "public" } as const;

const supportedFilterKeys = new Set<keyof CardFilter>([
  "categories",
  "colorsAny",
  "cost",
  "currentPower",
  "names",
  "power",
  "state",
  "typesAny",
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

const hasOnlySupportedFilterKeys = (filter: CardFilter): boolean =>
  Object.keys(filter).every((key) =>
    supportedFilterKeys.has(key as keyof CardFilter),
  );

const hasSupportedNumericFilter = (
  filter: CardFilter["cost"] | CardFilter["power"] | CardFilter["currentPower"],
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

const isSupportedFilter = (filter: CardFilter | undefined): boolean =>
  filter === undefined ||
  (hasOnlySupportedFilterKeys(filter) &&
    (filter.categories === undefined || isStringArray(filter.categories)) &&
    (filter.colorsAny === undefined || isStringArray(filter.colorsAny)) &&
    (filter.names === undefined || isStringArray(filter.names)) &&
    (filter.typesAny === undefined || isStringArray(filter.typesAny)) &&
    (filter.state === undefined ||
      filter.state === "active" ||
      filter.state === "rested") &&
    hasSupportedNumericFilter(filter.cost) &&
    hasSupportedNumericFilter(filter.power) &&
    hasSupportedNumericFilter(filter.currentPower));

const numericFilterMatches = (
  value: number | undefined,
  filter: CardFilter["cost"] | CardFilter["power"],
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

const cardMatchesFilter = (
  state: GameState,
  instance: CardInstance,
  card: ResolvedCard,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
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
  if (filter.names !== undefined && !filter.names.includes(card.name)) {
    return false;
  }
  if (filter.state !== undefined && instance.state !== filter.state) {
    return false;
  }

  if (!numericFilterMatches(card.cost, filter.cost)) {
    return false;
  }
  if (!numericFilterMatches(card.power, filter.power)) {
    return false;
  }
  if (filter.currentPower === undefined) {
    return true;
  }
  return numericFilterMatches(
    computeView(state, {
      supportStatusPolicy: "ignore",
      unsupportedCombatKeywordPolicy: "ignore",
    }).cards[instance.instanceId]?.currentPower,
    filter.currentPower,
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
  const targetPlayerId = resolvePlayerRef(state, request.player, context);
  if (chooserId === null || targetPlayerId === null) {
    return { ok: false, reason: "unresolvedPlayerRef" };
  }

  const cards = candidateCardsForZone(state, targetPlayerId, request.zone);
  if (cards === null) {
    return { ok: false, reason: "unresolvedPlayerRef" };
  }

  const candidates: TargetCandidate[] = [];
  for (const card of cards) {
    const metadata = state.cardManifest.cards[card.cardId];
    if (request.filter !== undefined && metadata === undefined) {
      return { ok: false, reason: "missingCardMetadata" };
    }

    if (
      metadata === undefined ||
      cardMatchesFilter(state, card, metadata, request.filter)
    ) {
      candidates.push({
        card: toCardRef(card, targetPlayerId),
        visibility: publicCandidateVisibility,
      });
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
