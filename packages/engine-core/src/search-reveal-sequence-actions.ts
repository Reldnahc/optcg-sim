import type { Action, CardRef, EngineResult, GameState } from "@optcg/types";

import { toEngineResult } from "./action-results.js";
import {
  retargetSequenceFrameAfterSearchRevealOrder,
  resumeSequenceFrameAfterSearchReveal,
} from "./effect-runtime-sequence-frames.js";
import { hasSequenceFrameForDecision } from "./effect-runtime-sequence-frame-decisions.js";
import { applySupportedSearchRevealChoiceResponse } from "./effect-runtime-search-reveal.js";
import { createSupportedTrashFromHandChoiceDecision } from "./effect-runtime-trash-from-hand.js";

const isCardRef = (value: unknown): value is CardRef => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const zone = candidate["zone"];
  return (
    typeof candidate["instanceId"] === "string" &&
    typeof candidate["cardId"] === "string" &&
    typeof candidate["playerId"] === "string" &&
    (zone === undefined || (typeof zone === "object" && zone !== null))
  );
};

const selectedCardsFromResponse = (
  action: Extract<Action, { type: "respondToDecision" }>,
): readonly CardRef[] =>
  action.response.type === "cards" &&
  Array.isArray((action.response as { cards?: unknown }).cards) &&
  (action.response as { cards: unknown[] }).cards.every(isCardRef)
    ? (action.response as { cards: CardRef[] }).cards
    : [];

export const applySearchRevealSequenceChoiceResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    !hasSequenceFrameForDecision(state, decision.id)
  ) {
    return null;
  }
  const searchResult = applySupportedSearchRevealChoiceResponse(state, action, {
    deferQueueResolution: true,
  });
  if (searchResult.errors !== undefined) {
    return searchResult;
  }
  const selectedCards = selectedCardsFromResponse(action);
  if (searchResult.state.pendingDecision !== undefined) {
    if (searchResult.state.pendingDecision.type !== "orderCards") {
      return searchResult;
    }
    return toEngineResult(
      retargetSequenceFrameAfterSearchRevealOrder(
        searchResult.state,
        decision.id,
        searchResult.state.pendingDecision,
        selectedCards,
      ),
      searchResult.events,
    );
  }
  const resumed = resumeSequenceFrameAfterSearchReveal(
    searchResult.state,
    decision.id,
    selectedCards,
    createSupportedTrashFromHandChoiceDecision,
  );
  if (resumed === undefined) {
    return searchResult;
  }
  if (!resumed.ok) {
    return toEngineResult(state, [], [resumed.error]);
  }
  return toEngineResult(resumed.state, [
    ...searchResult.events,
    ...resumed.events,
  ]);
};

export const resumeSequenceAfterSearchRevealOrderResponse = (
  state: GameState,
  orderResult: EngineResult,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "orderCards" ||
    !hasSequenceFrameForDecision(state, decision.id) ||
    orderResult.errors !== undefined ||
    orderResult.state.pendingDecision !== undefined
  ) {
    return null;
  }
  const resumed = resumeSequenceFrameAfterSearchReveal(
    orderResult.state,
    decision.id,
    [],
    createSupportedTrashFromHandChoiceDecision,
  );
  if (resumed === undefined) {
    return null;
  }
  if (!resumed.ok) {
    return toEngineResult(state, [], [resumed.error]);
  }
  return toEngineResult(resumed.state, [
    ...orderResult.events,
    ...resumed.events,
  ]);
};
