import type {
  Action,
  EngineResult,
  GameState,
  LegalAction,
  PaymentOption,
  PlayerId,
} from "@optcg/types";

import {
  appendEvent,
  type EngineResultOptions,
  illegalAction,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { isMatchActive } from "./actions/state.js";
import {
  applyBattleDecisionResponse,
  continueAttackTimingDecisionResultIfReady,
  applyDeclareAttack,
  applyUseCounter,
  getBattleDecisionLegalActions,
  getDeclareAttackLegalActions,
  resolveSupportedVanillaBattle,
} from "./battle/actions.js";
import { applyAttachDon, getAttachDonLegalActions } from "./actions/don.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./play-card/core.js";
import {
  applySelectTargetsDecisionResponse,
  getSelectTargetsLegalActions,
} from "./selection/actions.js";
import {
  detectPendingRuntimeWork,
  finalizeSelectedTargetEffectResolution,
  resumePlaySourceOverflowDecision,
} from "./effect-runtime.js";
import { getReplacementDecisionLegalActions } from "./replacement/decision-actions.js";
import { applyReplacementRestTargetDecisionWithContinuation } from "./replacement/rest-target-actions.js";
import { continueRuntimeAfterDecisionResult } from "./effect-runtime-decision-continuation.js";
import {
  resumeSequenceFrameAfterPlaySelectedOverflow,
  resumeSequenceFrameAfterReplacement,
} from "./effect-runtime-sequence/frames.js";
import { resumeSequenceFrameAfterReturnDonBody } from "./effect-runtime-sequence/return-don-body.js";
import {
  applyLifeTriggerDecisionResponse,
  getLifeTriggerLegalActions,
} from "./life-trigger/actions.js";
import {
  applyOptionalActivationDecisionResponse,
  getOptionalActivationLegalActions,
} from "./runtime/optional-activation/actions.js";
import {
  applySequenceSelectCardsChoiceResponse,
  applyPlaceSetRemainderSequenceAwareResponse,
  applySelectedHandDeckPlacementSequenceAwareResponse,
  applyTopDeckPlacementSequenceAwareResponse,
} from "./effect-runtime-sequence/decision-actions.js";
import {
  applySupportedTrashFromHandChoiceResponse,
  createSupportedTrashFromHandChoiceDecision,
  getTrashFromHandDecisionLegalActions,
  isTrashFromHandSelectCardsDecision,
} from "./runtime/primitives/trash-from-hand.js";
import {
  applySupportedHandSelectionChoiceResponse,
  getHandSelectionDecisionLegalActions,
  isHandSelectionSelectCardsDecision,
} from "./effect-runtime-hand-selection.js";
import { applyChooseTriggerOrderDecisionResponse } from "./actions/trigger-order.js";
import {
  applyChooseEffectOptionDecisionResponse,
  getChooseEffectOptionLegalActions,
} from "./actions/effect-option.js";
import {
  applyConcede,
  applyEndMainPhase,
  type EndMainPhaseOptions,
  getTurnLegalActions,
} from "./turn/actions.js";
import { advanceEndPhase } from "./turn/phases.js";
import {
  applyActivateMainAction,
  getActivateMainLegalActions,
} from "./runtime/optional-activation/activate-main.js";
import {
  applyActivatedReactionAction,
  getActivatedReactionLegalActions,
} from "./runtime/optional-activation/event-reaction.js";
import { finalizeSetupFromContinuation } from "./setup/initial-state.js";
import {
  applyStartOfGameSetupDecisionResponse,
  isStartOfGameSetupDecision,
} from "./setup/start-of-game-effects.js";
import {
  applyChooseQuantityDecisionResponse,
  getChooseQuantityLegalActions,
} from "./actions/quantity.js";
import {
  getRespondingPlayerId,
  hasMalformedRespondToDecisionPlayerId,
} from "./actions/responding-player.js";
import {
  applyChooseReplacementDecisionResponse,
  getChooseReplacementLegalActions,
} from "./replacement/choice-actions.js";
import { getReturnDonEligibleInstanceIds } from "./runtime/primitives/return-don.js";

const returnDonBodyDecisionPrefix = "decision:returnDon:sequence:";

export interface ApplyActionOptions
  extends EngineResultOptions, EndMainPhaseOptions {}

const getSetupStartOfGameLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const pending = state.pendingDecision;
  if (
    state.status.type !== "setup" ||
    pending === undefined ||
    !isStartOfGameSetupDecision(pending)
  ) {
    return [];
  }
  const decision = pending;
  if (decision.playerId !== playerId) return [];
  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    },
    ...decision.candidates.map((candidate) => ({
      type: "respondToDecision" as const,
      decisionId: decision.id,
      response: { type: "cards" as const, cards: [candidate.card] },
    })),
  ];
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
          ids: state.pendingDecision.triggerIds.slice(0, 1),
        },
      });
    }
    actions.push(...getLifeTriggerLegalActions(state, playerId));
    actions.push(...getReplacementDecisionLegalActions(state, playerId));
    actions.push(...getSelectTargetsLegalActions(state, playerId));
    actions.push(...getOptionalActivationLegalActions(state, playerId));
    actions.push(...getPlayCardLegalActions(state, playerId));
    actions.push(...getBattleDecisionLegalActions(state, playerId));
    actions.push(...getChooseReplacementLegalActions(state, playerId));
    actions.push(...getChooseEffectOptionLegalActions(state, playerId));
    actions.push(...getChooseQuantityLegalActions(state, playerId));
    actions.push(...getTrashFromHandDecisionLegalActions(state, playerId));
    actions.push(...getHandSelectionDecisionLegalActions(state, playerId));
    actions.push(...getSetupStartOfGameLegalActions(state, playerId));
    return actions;
  }

  actions.push(...getTurnLegalActions(state, playerId));
  actions.push(...getActivatedReactionLegalActions(state, playerId));
  actions.push(...getAttachDonLegalActions(state, playerId));
  actions.push(...getPlayCardLegalActions(state, playerId));
  actions.push(...getDeclareAttackLegalActions(state, playerId));
  actions.push(...getActivateMainLegalActions(state, playerId));
  return actions;
};

const continueRuntimeAndAttackTimingAfterDecision = (
  originalState: GameState,
  result: EngineResult,
  options: ApplyActionOptions = {},
): EngineResult => {
  const continued = continueAttackTimingDecisionResultIfReady(
    continueRuntimeAfterDecisionResult(originalState, result),
  );
  return continueEndPhaseIfReady(continued, options);
};

const continueEndPhaseIfReady = (
  result: EngineResult,
  options: ApplyActionOptions = {},
): EngineResult => {
  if (
    result.errors !== undefined ||
    result.state.pendingDecision !== undefined ||
    result.state.turn.phase !== "end" ||
    detectPendingRuntimeWork(result.state) !== undefined
  ) {
    return result;
  }
  const ended = advanceEndPhase(result.state, options);
  if (ended.errors !== undefined) {
    return ended;
  }
  return toEngineResult(
    ended.state,
    [...result.events, ...ended.events],
    undefined,
    options,
  );
};

const shouldContinueRuntimeAfterEffectDecision = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]>,
): boolean => {
  const causedBy = decision.causedBy;
  if (causedBy.type !== "effect") {
    return false;
  }
  return state.effectQueue.some((entry) => entry.id === causedBy.queueEntryId);
};

const continueAfterEffectDecision = (
  originalState: GameState,
  decision: NonNullable<GameState["pendingDecision"]>,
  result: EngineResult,
  options: ApplyActionOptions = {},
): EngineResult =>
  result.events.some((event) => event.type === "effectQueued") ||
  shouldContinueRuntimeAfterEffectDecision(originalState, decision)
    ? continueRuntimeAndAttackTimingAfterDecision(
        originalState,
        result,
        options,
      )
    : continueAttackTimingDecisionResultIfReady(result);

const applyReturnDonBodyDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "payCost" ||
    !String(decision.id).startsWith(returnDonBodyDecisionPrefix)
  ) {
    return null;
  }
  if (decision.cost.type !== "returnDon") {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "returnDon body decision is stale.",
        },
      ],
    );
  }
  if (action.response.type !== "payment") {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "returnDon body decision requires a payment response.",
        },
      ],
    );
  }
  if (action.response.optionId !== "returnDon") {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "Payment option mismatch.",
        },
      ],
    );
  }
  if (action.response.selectedCardInstanceIds !== undefined) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "returnDon body decision must not include card selection.",
        },
      ],
    );
  }
  const selectedDonIds = action.response.selectedDonInstanceIds;
  const selectedOption = decision.paymentOptions.find(
    (option): option is Extract<PaymentOption, { type: "returnDon" }> =>
      option.id === "returnDon" && option.type === "returnDon",
  );
  if (
    selectedDonIds === undefined ||
    selectedOption === undefined ||
    selectedDonIds.length !== selectedOption.count
  ) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "returnDon body DON!! selection count mismatch.",
        },
      ],
    );
  }
  if (new Set(selectedDonIds).size !== selectedDonIds.length) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "returnDon body DON!! selection contains duplicates.",
        },
      ],
    );
  }
  const player = state.players[decision.playerId];
  const eligibleIds =
    player === undefined
      ? new Set()
      : new Set(getReturnDonEligibleInstanceIds(player));
  if (
    player === undefined ||
    selectedDonIds.some((donId) => !eligibleIds.has(donId))
  ) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "returnDon body DON!! selection is invalid.",
        },
      ],
    );
  }

  const events: NonNullable<EngineResult["events"]> = [];
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
  const resolved = events[events.length - 1];
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

  const resumed = resumeSequenceFrameAfterReturnDonBody(
    nextState,
    decision.id,
    decision.playerId,
    selectedDonIds,
    createSupportedTrashFromHandChoiceDecision,
  );
  if (resumed === undefined) {
    return null;
  }
  if (!resumed.ok) {
    return toEngineResult(state, [], [resumed.error]);
  }
  return continueRuntimeAndAttackTimingAfterDecision(
    state,
    toEngineResult(resumed.state, [...events, ...resumed.events]),
  );
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
    if (
      decision.type === "selectCards" &&
      playCardResult.errors === undefined &&
      playCardResult.state.pendingDecision === undefined
    ) {
      const resumedPlaySource = resumePlaySourceOverflowDecision(
        state,
        decision,
        playCardResult,
      );
      if (resumedPlaySource !== undefined) {
        return continueRuntimeAndAttackTimingAfterDecision(
          state,
          resumedPlaySource,
        );
      }
    }
    if (
      decision.type === "selectCards" &&
      playCardResult.errors === undefined &&
      playCardResult.state.pendingDecision === undefined
    ) {
      const resumed = resumeSequenceFrameAfterPlaySelectedOverflow(
        playCardResult.state,
        decision.id,
      );
      if (resumed !== undefined) {
        if (!resumed.ok) {
          return toEngineResult(state, [], [resumed.error]);
        }
        return continueRuntimeAndAttackTimingAfterDecision(
          state,
          toEngineResult(resumed.state, [
            ...playCardResult.events,
            ...resumed.events,
          ]),
        );
      }
    }
    return playCardResult;
  }
  const sequenceSelectCards = applySequenceSelectCardsChoiceResponse(
    state,
    action,
  );
  if (sequenceSelectCards !== null) {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      sequenceSelectCards,
    );
  }
  if (isHandSelectionSelectCardsDecision(decision)) {
    const handSelection = applySupportedHandSelectionChoiceResponse(
      state,
      action,
    );
    if (handSelection !== null) {
      return continueRuntimeAndAttackTimingAfterDecision(state, handSelection);
    }
  }
  const battleResult = applyBattleDecisionResponse(state, action);
  if (battleResult !== null) {
    return battleResult.errors === undefined &&
      battleResult.state.battle?.step === "counter" &&
      battleResult.state.pendingDecision === undefined
      ? continueRuntimeAndAttackTimingAfterDecision(state, battleResult)
      : battleResult;
  }
  const lifeTriggerResult = applyLifeTriggerDecisionResponse(state, action);
  if (lifeTriggerResult !== null) {
    return lifeTriggerResult;
  }
  const replacementRestTargetResult =
    applyReplacementRestTargetDecisionWithContinuation(state, action);
  if (replacementRestTargetResult !== null) {
    return replacementRestTargetResult;
  }
  const returnDonBodyResult = applyReturnDonBodyDecisionResponse(state, action);
  if (returnDonBodyResult !== null) {
    return returnDonBodyResult;
  }
  const optionalActivationResult = applyOptionalActivationDecisionResponse(
    state,
    action,
  );
  if (optionalActivationResult !== null) {
    return continueAfterEffectDecision(
      state,
      decision,
      optionalActivationResult,
    );
  }
  const triggerOrderResult = applyChooseTriggerOrderDecisionResponse(
    state,
    action,
  );
  if (triggerOrderResult !== null) {
    return continueAfterEffectDecision(state, decision, triggerOrderResult);
  }
  const effectOptionResult = applyChooseEffectOptionDecisionResponse(
    state,
    action,
  );
  if (effectOptionResult !== null) {
    return continueAfterEffectDecision(state, decision, effectOptionResult);
  }
  const targetSelectionResult = applySelectTargetsDecisionResponse(
    state,
    action,
  );
  if (targetSelectionResult !== null) {
    return continueAfterEffectDecision(state, decision, targetSelectionResult);
  }
  const placeSetRemainderResult = applyPlaceSetRemainderSequenceAwareResponse(
    state,
    action,
  );
  if (placeSetRemainderResult !== null) {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      placeSetRemainderResult,
    );
  }
  const selectedHandDeckPlacementResult =
    applySelectedHandDeckPlacementSequenceAwareResponse(state, action);
  if (selectedHandDeckPlacementResult !== null) {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      selectedHandDeckPlacementResult,
    );
  }
  const topDeckPlacementResult = applyTopDeckPlacementSequenceAwareResponse(
    state,
    action,
  );
  if (topDeckPlacementResult !== null) {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      topDeckPlacementResult,
    );
  }
  if (isTrashFromHandSelectCardsDecision(decision)) {
    const trashResult = applySupportedTrashFromHandChoiceResponse(
      state,
      action,
    );
    if (!trashResult.ok) {
      return trashResult.result;
    }
    const resumedPendingDecision = trashResult.state.pendingDecision;
    const resumedSequenceDecision =
      resumedPendingDecision !== undefined &&
      trashResult.state.effectExecutionFrames.some(
        (frame) =>
          frame.pendingDecision.decisionId === resumedPendingDecision.id,
      );
    if (resumedSequenceDecision) {
      return continueAfterEffectDecision(
        state,
        decision,
        toEngineResult(trashResult.state, trashResult.allEvents),
      );
    }
    const finalized = finalizeSelectedTargetEffectResolution(
      trashResult.state,
      trashResult.eventBaseState,
      trashResult.entry,
      trashResult.allEvents,
      trashResult.resolutionEvents,
    );
    return continueAfterEffectDecision(state, decision, finalized);
  }
  const setupStartOfGame = applyStartOfGameSetupDecisionResponse(state, action);
  if (setupStartOfGame !== null) {
    if (setupStartOfGame.errors !== undefined) {
      return toEngineResult(state, [], setupStartOfGame.errors);
    }
    if (setupStartOfGame.shouldFinalizeSetup) {
      const finalized = finalizeSetupFromContinuation(setupStartOfGame.state);
      return toEngineResult(finalized, setupStartOfGame.events);
    }
    return toEngineResult(setupStartOfGame.state, setupStartOfGame.events);
  }
  const replacementResult = applyChooseReplacementDecisionResponse(
    state,
    action,
  );
  if (replacementResult !== null) {
    if (
      replacementResult.errors === undefined &&
      replacementResult.state.pendingDecision === undefined
    ) {
      const resumed = resumeSequenceFrameAfterReplacement(
        replacementResult.state,
        decision.id,
      );
      if (resumed !== undefined) {
        if (!resumed.ok) {
          return toEngineResult(state, [], [resumed.error]);
        }
        return continueRuntimeAndAttackTimingAfterDecision(
          state,
          toEngineResult(resumed.state, [
            ...replacementResult.events,
            ...resumed.events,
          ]),
        );
      }
    }
    return continueAfterEffectDecision(state, decision, replacementResult);
  }
  const chooseQuantityResult = applyChooseQuantityDecisionResponse(
    state,
    action,
  );
  if (chooseQuantityResult !== null) {
    return continueAfterEffectDecision(state, decision, chooseQuantityResult);
  }
  return illegalAction(state, "Unsupported decision type.");
};

export { resolveSupportedVanillaBattle };

export const applyAction = (
  state: GameState,
  action: Action,
  options: ApplyActionOptions = {},
): EngineResult => {
  if (action.type === "concede") {
    return applyConcede(state, action);
  }
  if (action.type === "respondToDecision") {
    return applyRespondToDecision(state, action);
  }
  if (action.type === "useCounter") {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      applyUseCounter(state, action),
      options,
    );
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
  if (action.type === "playCard") return applyPlayCard(state, action);
  if (action.type === "endMainPhase") return applyEndMainPhase(state, options);
  if (action.type === "attachDon") return applyAttachDon(state, action);
  if (action.type === "declareAttack") return applyDeclareAttack(state, action);
  if (action.type === "activateEffect")
    return (
      applyActivatedReactionAction(state, action) ??
      applyActivateMainAction(state, action)
    );
  return illegalAction(state, `Unsupported action type: ${action.type}`);
};
