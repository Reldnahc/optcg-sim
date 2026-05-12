import type {
  Effect,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  TransientCardSet,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import { resolvePlayerId } from "./effect-runtime-primitives.js";

type SearchEffect = Extract<Effect, { type: "search" }>;

export type SearchRevealTransientSetResult =
  | {
      events: EngineEvent[];
      kind: "created";
      ok: true;
      state: GameState;
      transientSet: TransientCardSet;
      transientSetHash: string;
    }
  | {
      events: EngineEvent[];
      kind: "noEligibleCandidate";
      ok: true;
      state: GameState;
    }
  | {
      error: EngineError;
      events: EngineEvent[];
      ok: false;
      state: GameState;
    };

type SearchRevealSupportGateFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-zone"
  | "unsupported-player-ref"
  | "unsupported-look-count"
  | "unsupported-filter"
  | "unsupported-selection-cardinality"
  | "unsupported-destination"
  | "unsupported-visibility"
  | "unsupported-shuffle"
  | "unsupported-remaining-cards-policy";

interface SearchRevealSupportGateErrorDetails {
  reason: SearchRevealSupportGateFailureReason;
}

const searchRevealSupportGateError = (
  effectId: EffectQueueEntry["effectBlockId"],
  reason: SearchRevealSupportGateFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies SearchRevealSupportGateErrorDetails,
});

const failClosed = (
  state: GameState,
  entry: EffectQueueEntry,
  reason: SearchRevealSupportGateFailureReason,
): SearchRevealTransientSetResult => ({
  error: searchRevealSupportGateError(entry.effectBlockId, reason),
  events: [],
  ok: false,
  state,
});

const isExactCharacterCategoryFilter = (
  filter: SearchEffect["request"]["filter"],
): boolean => {
  const keys = Object.keys(filter).sort();
  return (
    keys.length === 1 &&
    keys[0] === "categories" &&
    filter.categories !== undefined &&
    filter.categories.length === 1 &&
    filter.categories[0] === "character"
  );
};

const validateSupportedSearchEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SearchEffect,
):
  | { ok: true; playerId: EffectQueueEntry["controllerId"] }
  | { ok: false; reason: SearchRevealSupportGateFailureReason } => {
  const request = effect.request;
  if (request.zone !== "deck") {
    return { ok: false, reason: "unsupported-zone" };
  }
  if (request.player !== "self") {
    return { ok: false, reason: "unsupported-player-ref" };
  }
  const playerId = resolvePlayerId(state, entry, request.player);
  if (playerId === undefined || playerId !== entry.controllerId) {
    return { ok: false, reason: "unsupported-player-ref" };
  }
  if (request.lookCount !== 1) {
    return { ok: false, reason: "unsupported-look-count" };
  }
  if (!isExactCharacterCategoryFilter(request.filter)) {
    return { ok: false, reason: "unsupported-filter" };
  }
  if (request.min !== 0 || request.max !== 1) {
    return { ok: false, reason: "unsupported-selection-cardinality" };
  }
  if (request.destination !== "hand") {
    return { ok: false, reason: "unsupported-destination" };
  }
  if (request.revealTo !== "chooserOnly") {
    return { ok: false, reason: "unsupported-visibility" };
  }
  if (request.shuffleAfter !== false) {
    return { ok: false, reason: "unsupported-shuffle" };
  }
  if (request.remainingCards !== undefined) {
    return { ok: false, reason: "unsupported-remaining-cards-policy" };
  }
  return { ok: true, playerId };
};

export const createSupportedSearchRevealTransientSet = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SearchEffect,
): SearchRevealTransientSetResult => {
  const supported = validateSupportedSearchEffect(state, entry, effect);
  if (!supported.ok) {
    return failClosed(state, entry, supported.reason);
  }

  const player = state.players[supported.playerId];
  const topDeck = player?.deck[0];
  if (player === undefined || topDeck === undefined) {
    return {
      events: [],
      kind: "noEligibleCandidate",
      ok: true,
      state,
    };
  }

  const resolved = state.cardManifest.cards[topDeck.cardId];
  if (resolved?.category !== "character") {
    return {
      events: [],
      kind: "noEligibleCandidate",
      ok: true,
      state,
    };
  }

  const transientSet: TransientCardSet = {
    id: `set:search-reveal:${String(entry.id)}` as TransientCardSet["id"],
    cards: [
      {
        instanceId: topDeck.instanceId,
        cardId: topDeck.cardId,
        playerId: supported.playerId,
        zone: topDeck.zone,
      },
    ],
    origin: "topOfDeck",
    ownerId: topDeck.owner,
    controllerId: topDeck.controller,
    visibility: { type: "private", playerId: supported.playerId },
    cleanupPolicy: "returnToOrigin",
  };

  return {
    events: [],
    kind: "created",
    ok: true,
    state,
    transientSet,
    transientSetHash: hashCanonicalStateValue(transientSet),
  };
};
