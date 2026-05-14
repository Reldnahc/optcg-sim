import type {
  Action,
  CardRef,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  ReplacementProcess,
  ReplacementProcessState,
} from "@optcg/types";

import {
  appendEvent,
  illegalAction,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { isMatchActive } from "./action-state.js";
import {
  applyBattleDecisionResponse,
  continueAttackTimingBattleIfReady,
  applyDeclareAttack,
  applyUseCounter,
  getBattleDecisionLegalActions,
  getDeclareAttackLegalActions,
  resolveSupportedVanillaBattle,
} from "./battle-actions.js";
import { applyAttachDon, getAttachDonLegalActions } from "./don-actions.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./play-card.js";
import {
  applySelectTargetsDecisionResponse,
  getSelectTargetsLegalActions,
} from "./target-selection-actions.js";
import {
  detectPendingRuntimeWork,
  executeAcceptedSelectedTargetKoReplacementProcess,
  finalizeSelectedTargetEffectResolution,
} from "./effect-runtime.js";
import { executeUnreplacedSelectedTargetKoProcess } from "./effect-runtime-primitives.js";
import {
  applyLifeTriggerDecisionResponse,
  getLifeTriggerLegalActions,
} from "./life-trigger-actions.js";
import {
  applyOptionalActivationDecisionResponse,
  getOptionalActivationLegalActions,
} from "./optional-activation-actions.js";
import { applySupportedSearchRevealChoiceResponse } from "./effect-runtime-search-reveal.js";
import {
  applySupportedTrashFromHandChoiceResponse,
  getTrashFromHandDecisionLegalActions,
  isTrashFromHandSelectCardsDecision,
} from "./effect-runtime-trash-from-hand.js";
import { applyChooseTriggerOrderDecisionResponse } from "./trigger-order-actions.js";
import {
  applyConcede,
  applyEndMainPhase,
  getTurnLegalActions,
} from "./turn-actions.js";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const hasMalformedRespondToDecisionPlayerId = (
  action: Extract<Action, { type: "respondToDecision" }>,
): boolean =>
  "playerId" in action &&
  typeof (action as { playerId?: unknown }).playerId !== "string";

const getRespondingPlayerId = (
  action: Extract<Action, { type: "respondToDecision" }>,
  decisionPlayerId: PlayerId,
): PlayerId => {
  if (
    "playerId" in action &&
    typeof (action as { playerId?: unknown }).playerId === "string"
  ) {
    return (action as { playerId: PlayerId }).playerId;
  }
  return decisionPlayerId;
};

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

const effectIdFromStoredReplacementPayload = (
  payload: unknown,
  fallback: string,
): string => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "effectId" in payload &&
    typeof payload.effectId === "string"
  ) {
    return payload.effectId;
  }
  return fallback;
};

const queueEntryIdFromStoredReplacementPayload = (
  payload: unknown,
): string | undefined => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "queueEntryId" in payload &&
    typeof payload.queueEntryId === "string"
  ) {
    return payload.queueEntryId;
  }
  return undefined;
};

const replacementProcessFromState = (
  decision: Extract<
    NonNullable<GameState["pendingDecision"]>,
    { type: "chooseReplacement" }
  >,
  processState: ReplacementProcessState,
): ReplacementProcess | null => {
  const payload = processState.payload;
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const source = "source" in payload ? payload.source : undefined;
  const target = "target" in payload ? payload.target : undefined;
  if (source !== undefined && !isCardRef(source)) {
    return null;
  }
  if (target !== undefined && !isCardRef(target)) {
    return null;
  }
  return {
    id: processState.processId,
    type: processState.type,
    ...(source === undefined ? {} : { source }),
    ...(target === undefined ? {} : { target }),
    payload,
    causedBy: decision.causedBy,
    usedReplacementIds: [...processState.usedReplacementIds],
  };
};

const getChooseReplacementLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "chooseReplacement" ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "replacement" },
    },
    ...decision.replacementIds.map(
      (replacementId): LegalAction => ({
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "replacement", replacementId },
      }),
    ),
  ];
};

const getSearchRevealDecisionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    decision.playerId !== playerId ||
    decision.request.set === undefined ||
    !String(decision.request.set).startsWith("set:search-reveal:")
  ) {
    return [];
  }

  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    },
    ...decision.candidates.map(
      (candidate): LegalAction => ({
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "cards", cards: [candidate.card] },
      }),
    ),
  ];
};

const applyChooseReplacementDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "chooseReplacement") {
    return null;
  }
  if (hasMalformedRespondToDecisionPlayerId(action)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Player does not match current pending decision."),
    );
  }
  if (getRespondingPlayerId(action, decision.playerId) !== decision.playerId) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Player does not match current pending decision."),
    );
  }

  const response: unknown = action.response;
  if (typeof response !== "object" || response === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response must be an object for chooseReplacement."),
    );
  }
  const responseType = (response as { type?: unknown }).type;
  if (responseType !== "replacement") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Response type must be replacement for chooseReplacement.",
      ),
    );
  }

  const replacementId = (response as { replacementId?: unknown }).replacementId;
  if (replacementId !== undefined && typeof replacementId !== "string") {
    return toEngineResult(
      state,
      [],
      invalidDecision("replacementId must be a string."),
    );
  }
  if (replacementId !== undefined) {
    if (!decision.replacementIds.includes(replacementId)) {
      return toEngineResult(
        state,
        [],
        invalidDecision("replacementId must match an available replacement."),
      );
    }
  }
  if (decision.mandatory) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Mandatory replacement decisions cannot be declined."),
    );
  }

  const storedProcess = state.replacementState.find(
    (processState) => processState.processId === decision.processId,
  );
  if (storedProcess === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "chooseReplacement decision is stale for current replacement process.",
      ),
    );
  }
  const process = replacementProcessFromState(decision, storedProcess);
  if (process === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "chooseReplacement decision is stale for current replacement process.",
      ),
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
      responseType: action.response.type,
    },
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }

  const processState: GameState = {
    ...state,
    replacementState: state.replacementState.filter(
      (candidate) => candidate.processId !== decision.processId,
    ),
  };
  delete processState.pendingDecision;
  const queuedEntryId = queueEntryIdFromStoredReplacementPayload(
    storedProcess.payload,
  );
  const queuedEntry =
    queuedEntryId === undefined
      ? undefined
      : state.effectQueue.find((entry) => entry.id === queuedEntryId);

  if (replacementId !== undefined) {
    const applied = executeAcceptedSelectedTargetKoReplacementProcess(
      processState,
      events,
      effectIdFromStoredReplacementPayload(storedProcess.payload, decision.id),
      process,
      replacementId,
    );
    if ("error" in applied) {
      return toEngineResult(state, [], [applied.error]);
    }
    const nextState = {
      ...applied.state,
      actionSeq: state.actionSeq + 1,
    };
    return queuedEntry === undefined
      ? toEngineResult(nextState, events)
      : finalizeSelectedTargetEffectResolution(
          nextState,
          state,
          queuedEntry,
          events,
          events.slice(1),
        );
  }

  const unreplaced = executeUnreplacedSelectedTargetKoProcess(
    processState,
    events,
    effectIdFromStoredReplacementPayload(storedProcess.payload, decision.id),
    process,
  );
  if ("error" in unreplaced) {
    return toEngineResult(state, [], [unreplaced.error]);
  }

  const nextState: GameState = {
    ...unreplaced.state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  return queuedEntry === undefined
    ? toEngineResult(nextState, events)
    : finalizeSelectedTargetEffectResolution(
        nextState,
        state,
        queuedEntry,
        events,
        events.slice(1),
      );
};

export const getLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  if (!isMatchActive(state) || state.players[playerId] === undefined) {
    return [];
  }

  const actions: LegalAction[] = [{ type: "concede", playerId }];
  if (
    state.pendingDecision === undefined &&
    detectPendingRuntimeWork(state) !== undefined
  ) {
    return actions;
  }
  if (state.pendingDecision !== undefined) {
    if (
      state.pendingDecision.type === "chooseTriggerOrder" &&
      state.pendingDecision.playerId === playerId
    ) {
      actions.push({
        type: "respondToDecision",
        decisionId: state.pendingDecision.id,
        response: {
          type: "orderedIds",
          ids: [...state.pendingDecision.triggerIds],
        },
      });
    }
    actions.push(...getLifeTriggerLegalActions(state, playerId));
    actions.push(...getSelectTargetsLegalActions(state, playerId));
    actions.push(...getOptionalActivationLegalActions(state, playerId));
    actions.push(...getPlayCardLegalActions(state, playerId));
    actions.push(...getBattleDecisionLegalActions(state, playerId));
    actions.push(...getChooseReplacementLegalActions(state, playerId));
    actions.push(...getSearchRevealDecisionLegalActions(state, playerId));
    actions.push(...getTrashFromHandDecisionLegalActions(state, playerId));
    return actions;
  }

  actions.push(...getTurnLegalActions(state, playerId));
  actions.push(...getAttachDonLegalActions(state, playerId));
  actions.push(...getPlayCardLegalActions(state, playerId));
  actions.push(...getDeclareAttackLegalActions(state, playerId));
  return actions;
};

const applyRespondToDecision = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult => {
  const decision = state.pendingDecision;
  if (decision === undefined) {
    return illegalAction(state, "No pending decision.");
  }
  if (decision.id !== action.decisionId) {
    return illegalAction(
      state,
      "Decision id does not match current pending decision.",
    );
  }
  if (hasMalformedRespondToDecisionPlayerId(action)) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "Player does not match current pending decision.",
        },
      ],
    );
  }
  if (getRespondingPlayerId(action, decision.playerId) !== decision.playerId) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "Player does not match current pending decision.",
        },
      ],
    );
  }

  const playCardResult = applyPlayCardDecisionResponse(state, action);
  if (playCardResult !== null) {
    return playCardResult;
  }
  const battleResult = applyBattleDecisionResponse(state, action);
  if (battleResult !== null) {
    return battleResult;
  }
  const lifeTriggerResult = applyLifeTriggerDecisionResponse(state, action);
  if (lifeTriggerResult !== null) {
    return lifeTriggerResult;
  }
  const optionalActivationResult = applyOptionalActivationDecisionResponse(
    state,
    action,
  );
  if (optionalActivationResult !== null) {
    return optionalActivationResult;
  }
  const triggerOrderResult = applyChooseTriggerOrderDecisionResponse(
    state,
    action,
  );
  if (triggerOrderResult !== null) {
    return triggerOrderResult;
  }
  const targetSelectionResult = applySelectTargetsDecisionResponse(
    state,
    action,
  );
  if (targetSelectionResult !== null) {
    return targetSelectionResult;
  }
  if (
    decision.type === "selectCards" &&
    decision.request.set !== undefined &&
    String(decision.request.set).startsWith("set:search-reveal:")
  ) {
    return applySupportedSearchRevealChoiceResponse(state, action);
  }
  if (isTrashFromHandSelectCardsDecision(decision)) {
    const trashResult = applySupportedTrashFromHandChoiceResponse(
      state,
      action,
    );
    if (!trashResult.ok) {
      return trashResult.result;
    }
    const finalized = finalizeSelectedTargetEffectResolution(
      trashResult.state,
      trashResult.eventBaseState,
      trashResult.entry,
      trashResult.allEvents,
      trashResult.resolutionEvents,
    );
    if (
      finalized.errors !== undefined ||
      finalized.state.status.type !== "active"
    ) {
      return finalized;
    }
    const continued = continueAttackTimingBattleIfReady(finalized.state);
    if (continued === null) {
      return finalized;
    }
    return {
      ...continued,
      events: [...finalized.events, ...continued.events],
    };
  }
  const replacementResult = applyChooseReplacementDecisionResponse(
    state,
    action,
  );
  if (replacementResult !== null) {
    return replacementResult;
  }
  return illegalAction(state, "Unsupported decision type.");
};

export { resolveSupportedVanillaBattle };

export const applyAction = (state: GameState, action: Action): EngineResult => {
  if (action.type === "concede") {
    return applyConcede(state, action);
  }
  if (action.type === "respondToDecision") {
    return applyRespondToDecision(state, action);
  }
  if (action.type === "useCounter") {
    return applyUseCounter(state, action);
  }
  if (state.pendingDecision !== undefined) {
    return illegalAction(
      state,
      "Phase actions are illegal while a decision is pending.",
    );
  }
  if (detectPendingRuntimeWork(state) !== undefined) {
    return illegalAction(
      state,
      "Phase actions are illegal while effect runtime work is pending.",
    );
  }
  if (action.type === "playCard") {
    return applyPlayCard(state, action);
  }
  if (action.type === "endMainPhase") {
    return applyEndMainPhase(state);
  }
  if (action.type === "attachDon") {
    return applyAttachDon(state, action);
  }
  if (action.type === "declareAttack") {
    return applyDeclareAttack(state, action);
  }
  return illegalAction(state, `Unsupported action type: ${action.type}`);
};
