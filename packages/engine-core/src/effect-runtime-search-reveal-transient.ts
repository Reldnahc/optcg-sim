import type { EffectQueueEntry, GameState } from "@optcg/types";

import { cardMatchesSearchFilter } from "./action-state.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import {
  failClosed,
  isLegacyTopOneSearch,
  validateSupportedSearchEffect,
} from "./effect-runtime-search-reveal-support.js";
import type {
  EngineInternalTransientCardSet,
  SearchEffect,
  SearchRevealTransientSetResult,
} from "./effect-runtime-search-reveal-types.js";

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
  if (player === undefined || player.deck.length === 0) {
    return {
      events: [],
      kind: "noEligibleCandidate",
      ok: true,
      state,
    };
  }

  const lookedCards = player.deck.slice(0, effect.request.lookCount);
  const eligibleCards = lookedCards.filter((card) =>
    cardMatchesSearchFilter(
      state.cardManifest.cards[card.cardId],
      effect.request.filter,
    ),
  );
  if (
    eligibleCards.length === 0 &&
    (isLegacyTopOneSearch(effect) || lookedCards.length === 0)
  ) {
    return {
      events: [],
      kind: "noEligibleCandidate",
      ok: true,
      state,
    };
  }

  const transientSet: EngineInternalTransientCardSet = {
    id: `set:search-reveal:${String(entry.id)}`,
    cards: lookedCards.map((card) => ({
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: supported.playerId,
      zone: card.zone,
    })),
    origin: "topOfDeck",
    ownerId: supported.playerId,
    controllerId: supported.playerId,
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
