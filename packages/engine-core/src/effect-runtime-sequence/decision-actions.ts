import type {
  Action,
  CardRef,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import { toEngineResult } from "../action-results.js";
import {
  resumeSequenceFrameAfterHandSelection,
  resumeSequenceFrameAfterPlaceSetRemainder,
  resumeSequenceFrameAfterSelectedHandDeckPlacement,
  resumeSequenceFrameAfterTopDeckPlacement,
} from "./frames.js";
import { hasSequenceFrameForDecision } from "./frame-decisions.js";
import { createSupportedTrashFromHandChoiceDecision } from "../runtime/primitives/trash-from-hand.js";
import { applyTopDeckPlacementDecisionResponse } from "../effect-runtime-top-deck-placement.js";
import { applySelectedHandDeckPlacementDecisionResponse } from "./selected-segments.js";
import { applyPlaceSetRemainderOrderResponse } from "./remainder.js";
import {
  applyLifeReorderDecisionResponse,
  applyTopLifePlacementDecisionResponse,
} from "./life-state.js";

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

export const applySequenceSelectCardsChoiceResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    decision.request.set === undefined ||
    !hasSequenceFrameForDecision(state, decision.id)
  ) {
    return null;
  }
  const stateWithoutPendingDecision: GameState = { ...state };
  delete stateWithoutPendingDecision.pendingDecision;
  const resumed = resumeSequenceFrameAfterHandSelection(
    stateWithoutPendingDecision,
    decision,
    selectedCardsFromResponse(action),
  );
  if (resumed === undefined) {
    return null;
  }
  if (!resumed.ok) {
    return toEngineResult(state, [], [resumed.error]);
  }
  return toEngineResult(resumed.state, resumed.events);
};

export const getSequenceSelectCardsChoiceLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    decision.playerId !== playerId ||
    decision.request.set === undefined ||
    !hasSequenceFrameForDecision(state, decision.id)
  ) {
    return [];
  }
  const cards = decision.candidates
    .slice(0, decision.request.max)
    .map((candidate) => candidate.card);
  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards },
    },
  ];
};

export const resumeSequenceAfterTopDeckPlacementResponse = (
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
  const resumed = resumeSequenceFrameAfterTopDeckPlacement(
    orderResult.state,
    decision.id,
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

export const applyTopDeckPlacementSequenceAwareResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  const result = applyTopDeckPlacementDecisionResponse(state, action, {
    deferQueueResolution:
      decision?.type === "orderCards" &&
      hasSequenceFrameForDecision(state, decision.id),
  });
  if (result === null) {
    return null;
  }
  return resumeSequenceAfterTopDeckPlacementResponse(state, result) ?? result;
};

export const applyLifeReorderSequenceAwareResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  const result = applyLifeReorderDecisionResponse(state, action);
  if (result === null) {
    return null;
  }
  if (
    decision === undefined ||
    decision.type !== "orderCards" ||
    !hasSequenceFrameForDecision(state, decision.id) ||
    result.errors !== undefined ||
    result.state.pendingDecision !== undefined
  ) {
    return result;
  }
  const resumed = resumeSequenceFrameAfterTopDeckPlacement(
    result.state,
    decision.id,
    createSupportedTrashFromHandChoiceDecision,
  );
  if (resumed === undefined) {
    return result;
  }
  if (!resumed.ok) {
    return toEngineResult(state, [], [resumed.error]);
  }
  return toEngineResult(resumed.state, [...result.events, ...resumed.events]);
};

export const applyTopLifePlacementSequenceAwareResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  const result = applyTopLifePlacementDecisionResponse(state, action);
  if (result === null) {
    return null;
  }
  if (
    decision === undefined ||
    decision.type !== "orderCards" ||
    !hasSequenceFrameForDecision(state, decision.id) ||
    result.errors !== undefined ||
    result.state.pendingDecision !== undefined
  ) {
    return result;
  }
  const resumed = resumeSequenceFrameAfterTopDeckPlacement(
    result.state,
    decision.id,
    createSupportedTrashFromHandChoiceDecision,
  );
  if (resumed === undefined) {
    return result;
  }
  if (!resumed.ok) {
    return toEngineResult(state, [], [resumed.error]);
  }
  return toEngineResult(resumed.state, [...result.events, ...resumed.events]);
};

export const applySelectedHandDeckPlacementSequenceAwareResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  const result = applySelectedHandDeckPlacementDecisionResponse(state, action);
  if (result === null) {
    return null;
  }
  if (!result.ok) {
    return toEngineResult(state, [], result.errors);
  }
  if (
    decision === undefined ||
    decision.type !== "orderCards" ||
    !hasSequenceFrameForDecision(state, decision.id) ||
    result.state.pendingDecision !== undefined
  ) {
    return toEngineResult(result.state, result.events);
  }
  const resumed = resumeSequenceFrameAfterSelectedHandDeckPlacement(
    result.state,
    decision.id,
    createSupportedTrashFromHandChoiceDecision,
  );
  if (resumed === undefined) {
    return toEngineResult(result.state, result.events);
  }
  if (!resumed.ok) {
    return toEngineResult(state, [], [resumed.error]);
  }
  return toEngineResult(resumed.state, [...result.events, ...resumed.events]);
};

export const applyPlaceSetRemainderSequenceAwareResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  const result = applyPlaceSetRemainderOrderResponse(state, action);
  if (result === null) {
    return null;
  }
  if (
    decision === undefined ||
    decision.type !== "orderCards" ||
    !hasSequenceFrameForDecision(state, decision.id) ||
    result.errors !== undefined ||
    result.state.pendingDecision !== undefined
  ) {
    return result;
  }
  const resumed = resumeSequenceFrameAfterPlaceSetRemainder(
    result.state,
    decision.id,
    createSupportedTrashFromHandChoiceDecision,
  );
  if (resumed === undefined) {
    return result;
  }
  if (!resumed.ok) {
    return toEngineResult(state, [], [resumed.error]);
  }
  return toEngineResult(resumed.state, [...result.events, ...resumed.events]);
};
