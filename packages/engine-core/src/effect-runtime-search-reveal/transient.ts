import type { EffectQueueEntry, GameState } from "@optcg/types";

import { cardMatchesSearchFilter } from "../actions/state.js";
import { createPrivateTopDeckLookSet } from "../effect-runtime-card-set/looked-set.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import {
  failClosed,
  isLegacyTopOneSearch,
  validateSupportedSearchEffect,
} from "./support.js";
import type { SearchEffect, SearchRevealTransientSetResult } from "./types.js";

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
  const lookCount = effect.request.lookCount;
  if (typeof lookCount !== "number") {
    return failClosed(state, entry, "unsupported-look-count");
  }

  const transientSet = createPrivateTopDeckLookSet({
    count: lookCount,
    playerId: supported.playerId,
    setId: `set:search-reveal:${String(entry.id)}`,
    state,
  });
  if (transientSet === null) {
    return {
      events: [],
      kind: "noEligibleCandidate",
      ok: true,
      state,
    };
  }
  const lookedCards = player.deck.slice(0, lookCount);
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

  return {
    events: [],
    kind: "created",
    ok: true,
    state,
    transientSet,
    transientSetHash: hashCanonicalStateValue(transientSet),
  };
};
