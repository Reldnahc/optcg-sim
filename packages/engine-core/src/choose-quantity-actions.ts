import type {
  Action,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import {
  detectPendingRuntimeWork,
  processEffectRuntime,
} from "./effect-runtime.js";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const isSupportedChooseQuantityMode = (
  mode: unknown,
): mode is "exact" | "upTo" => mode === "exact" || mode === "upTo";

export const getChooseQuantityLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "chooseQuantity" ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  const mode: unknown = decision.mode;
  if (
    !Number.isInteger(decision.min) ||
    !Number.isInteger(decision.max) ||
    decision.min < 0 ||
    decision.min > decision.max ||
    !isSupportedChooseQuantityMode(mode) ||
    (mode === "exact" && decision.min !== decision.max)
  ) {
    return [];
  }
  const actions: LegalAction[] = [];
  for (let quantity = decision.min; quantity <= decision.max; quantity += 1) {
    actions.push({
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "chooseQuantity", quantity },
    });
  }
  return actions;
};

const hasCurrentChooseQuantityRuntimeContext = (
  state: GameState,
  decision: Extract<
    NonNullable<GameState["pendingDecision"]>,
    { type: "chooseQuantity" }
  >,
): boolean => {
  const causedBy = decision.causedBy;
  if (causedBy.type !== "effect") {
    return true;
  }
  const queueEntry = state.effectQueue.find(
    (entry) =>
      entry.id === causedBy.queueEntryId &&
      entry.effectBlockId === causedBy.effectId,
  );
  if (queueEntry === undefined) {
    return false;
  }
  if (queueEntry.state === "pending") {
    return true;
  }
  if (queueEntry.state !== "resolving") {
    return false;
  }
  return state.effectExecutionFrames.some(
    (frame) =>
      frame.queueEntryId === causedBy.queueEntryId &&
      frame.effectBlockId === causedBy.effectId &&
      frame.pendingDecision.decisionId === decision.id &&
      frame.pendingDecision.causedBy.type === "effect" &&
      frame.pendingDecision.causedBy.queueEntryId === causedBy.queueEntryId &&
      frame.pendingDecision.causedBy.effectId === causedBy.effectId,
  );
};

export const applyChooseQuantityDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "chooseQuantity") {
    return null;
  }
  const response: unknown = action.response;
  if (typeof response !== "object" || response === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response must be an object for chooseQuantity."),
    );
  }
  const responseType = (response as { type?: unknown }).type;
  if (responseType !== "chooseQuantity") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Response type must be chooseQuantity for chooseQuantity.",
      ),
    );
  }
  const mode: unknown = decision.mode;
  if (
    !Number.isInteger(decision.min) ||
    !Number.isInteger(decision.max) ||
    decision.min < 0 ||
    decision.min > decision.max ||
    !isSupportedChooseQuantityMode(mode) ||
    (mode === "exact" && decision.min !== decision.max)
  ) {
    return toEngineResult(
      state,
      [],
      invalidDecision("chooseQuantity bounds are malformed."),
    );
  }
  if (!hasCurrentChooseQuantityRuntimeContext(state, decision)) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "chooseQuantity decision is stale for current effect queue.",
      ),
    );
  }
  const quantity = (response as { quantity?: unknown }).quantity;
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < decision.min ||
    quantity > decision.max
  ) {
    return toEngineResult(
      state,
      [],
      invalidDecision("quantity must be a whole number within min and max."),
    );
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType,
      quantity,
    },
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;

  if (detectPendingRuntimeWork(nextState) === undefined) {
    return toEngineResult(nextState, events);
  }
  const resumed = processEffectRuntime(nextState);
  return {
    ...resumed,
    events: [...events, ...resumed.events],
  };
};
