import type {
  CardFilter,
  CardInstance,
  GameState,
  PlayerId,
  PlayerRef,
  ResolvedCard,
  TargetCandidate,
  TargetRequest,
  Zone,
} from "@optcg/types";

import { getOpponentId, toCardRef } from "./action-state.js";

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
  "cost",
  "power",
]);

const supportedZones = new Set<Zone>(["leaderArea", "characterArea"]);

const isValidTargetCount = (request: TargetRequest): boolean =>
  Number.isInteger(request.min) &&
  Number.isInteger(request.max) &&
  request.min >= 0 &&
  request.max >= 0 &&
  request.min <= request.max;

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
  filter: CardFilter["cost"] | CardFilter["power"],
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

const isSupportedFilter = (filter: CardFilter | undefined): boolean =>
  filter === undefined ||
  (hasOnlySupportedFilterKeys(filter) &&
    hasSupportedNumericFilter(filter.cost) &&
    hasSupportedNumericFilter(filter.power));

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

  return (
    numericFilterMatches(card.cost, filter.cost) &&
    numericFilterMatches(card.power, filter.power)
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

    if (metadata === undefined || cardMatchesFilter(metadata, request.filter)) {
      candidates.push({
        card: toCardRef(card, targetPlayerId),
        visibility: publicCandidateVisibility,
      });
    }
  }

  return { ok: true, candidates };
};
