import type { EffectQueueEntry, EngineError, GameState } from "@optcg/types";

import { isSupportedSearchCardFilter } from "../action-state.js";
import { resolvePlayerId } from "../effect-runtime-primitives.js";
import {
  hasSupportedRemainingCardsPolicy,
  isExactCharacterCategoryFilter,
} from "./remainder.js";
import type {
  SearchEffect,
  SearchRevealChoiceDecisionResult,
  SearchRevealSupportGateErrorDetails,
  SearchRevealSupportGateFailureReason,
  SearchRevealTransientSetResult,
} from "./types.js";

export const searchRevealSupportGateError = (
  effectId: EffectQueueEntry["effectBlockId"],
  reason: SearchRevealSupportGateFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies SearchRevealSupportGateErrorDetails,
});

export const failClosed = (
  state: GameState,
  entry: EffectQueueEntry,
  reason: SearchRevealSupportGateFailureReason,
): SearchRevealTransientSetResult => ({
  error: searchRevealSupportGateError(entry.effectBlockId, reason),
  events: [],
  ok: false,
  state,
});

export const failChoiceClosed = (
  state: GameState,
  entry: EffectQueueEntry,
  reason: SearchRevealSupportGateFailureReason,
): SearchRevealChoiceDecisionResult => ({
  error: searchRevealSupportGateError(entry.effectBlockId, reason),
  events: [],
  ok: false,
  state,
});

export const isLegacyTopOneSearch = (effect: SearchEffect): boolean =>
  effect.request.lookCount === 1 &&
  effect.request.remainingCards === undefined &&
  isExactCharacterCategoryFilter(effect.request.filter);

const isLegacyTopOneSearchRequest = (
  request: SearchEffect["request"],
): boolean =>
  request.lookCount === 1 &&
  request.remainingCards === undefined &&
  isExactCharacterCategoryFilter(request.filter);

export const isSupportedSearchRequestShape = (
  request: SearchEffect["request"],
): boolean =>
  request.zone === "deck" &&
  request.player === "self" &&
  typeof request.lookCount === "number" &&
  Number.isSafeInteger(request.lookCount) &&
  request.lookCount >= 1 &&
  isSupportedSearchCardFilter(request.filter) &&
  request.min === 0 &&
  request.max === 1 &&
  request.destination === "hand" &&
  (request.revealTo === "chooserOnly" || request.revealTo === "bothPlayers") &&
  request.shuffleAfter === false &&
  (isLegacyTopOneSearchRequest(request) ||
    hasSupportedRemainingCardsPolicy(request)) &&
  (request.remainingCards === undefined ||
    hasSupportedRemainingCardsPolicy(request));

export const validateSupportedSearchEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SearchEffect,
):
  | { ok: true; playerId: EffectQueueEntry["controllerId"] }
  | { ok: false; reason: SearchRevealSupportGateFailureReason } => {
  const request = effect.request;
  if (request.zone !== "deck") return { ok: false, reason: "unsupported-zone" };
  if (request.player !== "self")
    return { ok: false, reason: "unsupported-player-ref" };
  const playerId = resolvePlayerId(state, entry, request.player);
  if (playerId === undefined || playerId !== entry.controllerId) {
    return { ok: false, reason: "unsupported-player-ref" };
  }
  const lookCount = request.lookCount;
  if (
    typeof lookCount !== "number" ||
    !Number.isSafeInteger(lookCount) ||
    lookCount < 1
  )
    return { ok: false, reason: "unsupported-look-count" };
  if (!isSupportedSearchCardFilter(request.filter))
    return { ok: false, reason: "unsupported-filter" };
  if (request.min !== 0 || request.max !== 1)
    return { ok: false, reason: "unsupported-selection-cardinality" };
  if (request.destination !== "hand")
    return { ok: false, reason: "unsupported-destination" };
  if (request.revealTo !== "chooserOnly" && request.revealTo !== "bothPlayers")
    return { ok: false, reason: "unsupported-visibility" };
  if (request.shuffleAfter !== false)
    return { ok: false, reason: "unsupported-shuffle" };
  if (
    lookCount === 1 &&
    request.remainingCards === undefined &&
    !isLegacyTopOneSearch(effect)
  ) {
    return { ok: false, reason: "unsupported-remaining-cards-policy" };
  }
  if (lookCount > 1 && !hasSupportedRemainingCardsPolicy(request)) {
    return { ok: false, reason: "unsupported-remaining-cards-policy" };
  }
  if (
    request.remainingCards !== undefined &&
    !hasSupportedRemainingCardsPolicy(request)
  ) {
    return { ok: false, reason: "unsupported-remaining-cards-policy" };
  }
  return { ok: true, playerId };
};
