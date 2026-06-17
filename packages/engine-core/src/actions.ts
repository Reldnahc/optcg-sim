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
  applyAttackCostDecisionResponse,
  continueAttackTimingDecisionResultIfReady,
  applyDeclareAttack,
  applyUseCounter,
  getBattleDecisionLegalActions,
  getAttackCostDecisionLegalActions,
  getDeclareAttackLegalActions,
  resolveSupportedVanillaBattle,
} from "./battle/actions.js";
import {
  parseCounterPayCostDecisionId,
  parseCounterTargetDecisionId,
} from "./battle/counter-event-payment-context.js";
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
import { applyReplacementRestTargetDecisionWithContinuation as applyReplacementContinuationDecision } from "./replacement/rest-target-actions.js";
import { prependEventsToEngineResult } from "./engine-result-events.js";
import { continueRuntimeAfterDecisionResult } from "./effect-runtime-decision-continuation.js";
import {
  resumeSequenceFrameAfterLifeTriggerDecision,
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
  applyLifeReorderSequenceAwareResponse,
  applySequenceSelectCardsChoiceResponse,
  getSequenceSelectCardsChoiceLegalActions,
  applyPlaceSetRemainderSequenceAwareResponse,
  applySelectedHandDeckPlacementSequenceAwareResponse,
  applyTopLifePlacementSequenceAwareResponse,
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
import {
  applyStartOfTurnAction,
  getStartOfTurnLegalActions,
} from "./runtime/optional-activation/start-of-turn.js";
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

const profileActionSpan = <T>(
  options: ApplyActionOptions,
  name: string,
  fn: () => T,
): T => options.profileSpan?.(name, fn) ?? fn();

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
    actions.push(...getAttackCostDecisionLegalActions(state, playerId));
    actions.push(...getChooseReplacementLegalActions(state, playerId));
    actions.push(...getChooseEffectOptionLegalActions(state, playerId));
    actions.push(...getChooseQuantityLegalActions(state, playerId));
    actions.push(...getTrashFromHandDecisionLegalActions(state, playerId));
    actions.push(...getHandSelectionDecisionLegalActions(state, playerId));
    actions.push(...getSequenceSelectCardsChoiceLegalActions(state, playerId));
    actions.push(...getSetupStartOfGameLegalActions(state, playerId));
    return actions;
  }

  actions.push(...getTurnLegalActions(state, playerId));
  actions.push(...getStartOfTurnLegalActions(state, playerId));
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
    continueRuntimeAfterDecisionResult(originalState, result, options),
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

const isCounterStepPassDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): boolean =>
  decision.type === "selectCards" &&
  String(decision.id).startsWith("decision:counterStep:pass:") &&
  decision.request.min === 0 &&
  decision.request.max === 0 &&
  decision.defaultResponse?.type === "cards" &&
  decision.defaultResponse.cards.length === 0 &&
  decision.candidates.length === 0;

const isCounterStepBattleDecision = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]>,
): boolean =>
  state.battle?.step === "counter" &&
  (isCounterStepPassDecision(decision) ||
    (decision.type === "payCost" &&
      parseCounterPayCostDecisionId(String(decision.id)) !== null) ||
    (decision.type === "selectTargets" &&
      parseCounterTargetDecisionId(String(decision.id)) !== null));

const applyBattleDecisionResponseWithContinuation = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: ApplyActionOptions,
): EngineResult | null => {
  const battleResult = profileActionSpan(
    options,
    "engine:decision:battle",
    () => applyBattleDecisionResponse(state, action, options),
  );
  if (battleResult === null) {
    return null;
  }
  return battleResult.errors === undefined &&
    battleResult.state.battle?.step === "counter" &&
    battleResult.state.pendingDecision === undefined
    ? continueRuntimeAndAttackTimingAfterDecision(state, battleResult, options)
    : battleResult;
};

const applyLifeTriggerDecisionResponseWithContinuation = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  decision: NonNullable<GameState["pendingDecision"]>,
  options: ApplyActionOptions,
): EngineResult | null => {
  const lifeTriggerResult = profileActionSpan(
    options,
    "engine:decision:lifeTrigger",
    () => applyLifeTriggerDecisionResponse(state, action, options),
  );
  if (lifeTriggerResult === null) {
    return null;
  }
  if (
    lifeTriggerResult.errors === undefined &&
    lifeTriggerResult.state.pendingDecision === undefined
  ) {
    const resumed = resumeSequenceFrameAfterLifeTriggerDecision(
      lifeTriggerResult.state,
      decision.id,
      lifeTriggerResult.events,
    );
    if (resumed !== undefined) {
      if (!resumed.ok) {
        return toEngineResult(state, [], [resumed.error], options);
      }
      return continueRuntimeAndAttackTimingAfterDecision(
        state,
        toEngineResult(
          resumed.state,
          [...lifeTriggerResult.events, ...resumed.events],
          undefined,
          options,
        ),
        options,
      );
    }
  }
  return lifeTriggerResult;
};

const applyReturnDonBodyDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: ApplyActionOptions = {},
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
    return toEngineResult(state, [], [resumed.error], options);
  }
  return continueRuntimeAndAttackTimingAfterDecision(
    state,
    toEngineResult(
      resumed.state,
      [...events, ...resumed.events],
      undefined,
      options,
    ),
    options,
  );
};

const applyRespondToDecision = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: ApplyActionOptions = {},
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

  if (decision.type === "confirmLifeTrigger") {
    const lifeTriggerResult = applyLifeTriggerDecisionResponseWithContinuation(
      state,
      action,
      decision,
      options,
    );
    if (lifeTriggerResult !== null) {
      return lifeTriggerResult;
    }
  }
  if (isCounterStepBattleDecision(state, decision)) {
    const battleResult = applyBattleDecisionResponseWithContinuation(
      state,
      action,
      options,
    );
    if (battleResult !== null) {
      return battleResult;
    }
  }

  const playCardResult = profileActionSpan(
    options,
    "engine:decision:playCard",
    () => applyPlayCardDecisionResponse(state, action, options),
  );
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
          options,
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
          return toEngineResult(state, [], [resumed.error], options);
        }
        return continueRuntimeAndAttackTimingAfterDecision(
          state,
          toEngineResult(
            resumed.state,
            [...playCardResult.events, ...resumed.events],
            undefined,
            options,
          ),
          options,
        );
      }
    }
    return playCardResult;
  }
  const sequenceSelectCards = profileActionSpan(
    options,
    "engine:decision:sequenceSelectCards",
    () => applySequenceSelectCardsChoiceResponse(state, action, options),
  );
  if (sequenceSelectCards !== null)
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      sequenceSelectCards,
      options,
    );
  const attackCost = profileActionSpan(
    options,
    "engine:decision:attackCost",
    () => applyAttackCostDecisionResponse(state, action, options),
  );
  if (attackCost !== null) return attackCost;
  if (isHandSelectionSelectCardsDecision(decision)) {
    const handSelection = profileActionSpan(
      options,
      "engine:decision:handSelection",
      () => applySupportedHandSelectionChoiceResponse(state, action, options),
    );
    if (handSelection !== null) {
      return continueRuntimeAndAttackTimingAfterDecision(
        state,
        handSelection,
        options,
      );
    }
  }
  const replacementRestTargetResult = profileActionSpan(
    options,
    "engine:decision:replacementRestTarget",
    () => applyReplacementContinuationDecision(state, action, options),
  );
  if (replacementRestTargetResult !== null) return replacementRestTargetResult;
  const battleResult = applyBattleDecisionResponseWithContinuation(
    state,
    action,
    options,
  );
  if (battleResult !== null) return battleResult;
  const lifeTriggerResult = applyLifeTriggerDecisionResponseWithContinuation(
    state,
    action,
    decision,
    options,
  );
  if (lifeTriggerResult !== null) return lifeTriggerResult;
  const returnDonBodyResult = profileActionSpan(
    options,
    "engine:decision:returnDonBody",
    () => applyReturnDonBodyDecisionResponse(state, action, options),
  );
  if (returnDonBodyResult !== null) {
    return returnDonBodyResult;
  }
  const optionalActivationResult = profileActionSpan(
    options,
    "engine:decision:optionalActivation",
    () => applyOptionalActivationDecisionResponse(state, action, options),
  );
  if (optionalActivationResult !== null) {
    return continueAfterEffectDecision(
      state,
      decision,
      optionalActivationResult,
      options,
    );
  }
  const triggerOrderResult = profileActionSpan(
    options,
    "engine:decision:triggerOrder",
    () => applyChooseTriggerOrderDecisionResponse(state, action, options),
  );
  if (triggerOrderResult !== null) {
    return continueAfterEffectDecision(
      state,
      decision,
      triggerOrderResult,
      options,
    );
  }
  const effectOptionResult = profileActionSpan(
    options,
    "engine:decision:effectOption",
    () => applyChooseEffectOptionDecisionResponse(state, action, options),
  );
  if (effectOptionResult !== null) {
    return continueAfterEffectDecision(
      state,
      decision,
      effectOptionResult,
      options,
    );
  }
  const targetSelectionResult = profileActionSpan(
    options,
    "engine:decision:targetSelection",
    () => applySelectTargetsDecisionResponse(state, action, options),
  );
  if (targetSelectionResult !== null) {
    return continueAfterEffectDecision(
      state,
      decision,
      targetSelectionResult,
      options,
    );
  }
  const placeSetRemainderResult = profileActionSpan(
    options,
    "engine:decision:placeSetRemainder",
    () => applyPlaceSetRemainderSequenceAwareResponse(state, action, options),
  );
  if (placeSetRemainderResult !== null) {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      placeSetRemainderResult,
      options,
    );
  }
  const lifeReorderResult = profileActionSpan(
    options,
    "engine:decision:lifeReorder",
    () => applyLifeReorderSequenceAwareResponse(state, action, options),
  );
  if (lifeReorderResult !== null) {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      lifeReorderResult,
      options,
    );
  }
  const topLifePlacementResult = profileActionSpan(
    options,
    "engine:decision:topLifePlacement",
    () => applyTopLifePlacementSequenceAwareResponse(state, action, options),
  );
  if (topLifePlacementResult !== null) {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      topLifePlacementResult,
      options,
    );
  }
  const selectedHandDeckPlacementResult = profileActionSpan(
    options,
    "engine:decision:selectedHandDeckPlacement",
    () =>
      applySelectedHandDeckPlacementSequenceAwareResponse(
        state,
        action,
        options,
      ),
  );
  if (selectedHandDeckPlacementResult !== null) {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      selectedHandDeckPlacementResult,
      options,
    );
  }
  const topDeckPlacementResult = profileActionSpan(
    options,
    "engine:decision:topDeckPlacement",
    () => applyTopDeckPlacementSequenceAwareResponse(state, action, options),
  );
  if (topDeckPlacementResult !== null) {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      topDeckPlacementResult,
      options,
    );
  }
  if (isTrashFromHandSelectCardsDecision(decision)) {
    const trashResult = profileActionSpan(
      options,
      "engine:decision:trashFromHand",
      () => applySupportedTrashFromHandChoiceResponse(state, action, options),
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
        toEngineResult(
          trashResult.state,
          trashResult.allEvents,
          undefined,
          options,
        ),
        options,
      );
    }
    const finalized = finalizeSelectedTargetEffectResolution(
      trashResult.state,
      trashResult.eventBaseState,
      trashResult.entry,
      trashResult.allEvents,
      trashResult.resolutionEvents,
    );
    return continueAfterEffectDecision(
      state,
      decision,
      prependEventsToEngineResult(finalized, [], options),
      options,
    );
  }
  const setupStartOfGame = profileActionSpan(
    options,
    "engine:decision:setupStartOfGame",
    () => applyStartOfGameSetupDecisionResponse(state, action),
  );
  if (setupStartOfGame !== null) {
    if (setupStartOfGame.errors !== undefined) {
      return toEngineResult(state, [], setupStartOfGame.errors, options);
    }
    if (setupStartOfGame.shouldFinalizeSetup) {
      const finalized = finalizeSetupFromContinuation(setupStartOfGame.state);
      return toEngineResult(
        finalized,
        setupStartOfGame.events,
        undefined,
        options,
      );
    }
    return toEngineResult(
      setupStartOfGame.state,
      setupStartOfGame.events,
      undefined,
      options,
    );
  }
  const replacementResult = profileActionSpan(
    options,
    "engine:decision:replacement",
    () => applyChooseReplacementDecisionResponse(state, action, options),
  );
  if (replacementResult !== null) {
    if (
      replacementResult.errors === undefined &&
      replacementResult.state.pendingDecision === undefined
    ) {
      const resumed = resumeSequenceFrameAfterReplacement(
        replacementResult.state,
        decision.id,
        replacementResult.events,
      );
      if (resumed !== undefined) {
        if (!resumed.ok) {
          return toEngineResult(state, [], [resumed.error], options);
        }
        return continueRuntimeAndAttackTimingAfterDecision(
          state,
          toEngineResult(
            resumed.state,
            [...replacementResult.events, ...resumed.events],
            undefined,
            options,
          ),
          options,
        );
      }
    }
    return continueAfterEffectDecision(
      state,
      decision,
      replacementResult,
      options,
    );
  }
  const chooseQuantityResult = profileActionSpan(
    options,
    "engine:decision:chooseQuantity",
    () => applyChooseQuantityDecisionResponse(state, action, options),
  );
  if (chooseQuantityResult !== null) {
    return continueAfterEffectDecision(
      state,
      decision,
      chooseQuantityResult,
      options,
    );
  }
  return illegalAction(state, "Unsupported decision type.");
};

export { resolveSupportedVanillaBattle };

export const applyAction = (
  state: GameState,
  action: Action,
  options: ApplyActionOptions = {},
): EngineResult =>
  profileActionSpan(options, "engine:applyAction", () => {
    if (action.type === "concede") {
      return profileActionSpan(options, "engine:applyAction:concede", () =>
        applyConcede(state, action),
      );
    }
    if (action.type === "respondToDecision") {
      return profileActionSpan(
        options,
        "engine:applyAction:respondToDecision",
        () => applyRespondToDecision(state, action, options),
      );
    }
    if (action.type === "useCounter") {
      return profileActionSpan(options, "engine:applyAction:useCounter", () =>
        continueRuntimeAndAttackTimingAfterDecision(
          state,
          applyUseCounter(state, action, options),
          options,
        ),
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
    if (action.type === "playCard")
      return profileActionSpan(options, "engine:applyAction:playCard", () =>
        applyPlayCard(state, action, options),
      );
    if (action.type === "endMainPhase")
      return profileActionSpan(options, "engine:applyAction:endMainPhase", () =>
        applyEndMainPhase(state, options),
      );
    if (action.type === "attachDon")
      return profileActionSpan(options, "engine:applyAction:attachDon", () =>
        applyAttachDon(state, action, options),
      );
    if (action.type === "declareAttack")
      return profileActionSpan(
        options,
        "engine:applyAction:declareAttack",
        () => applyDeclareAttack(state, action, options),
      );
    if (action.type === "activateEffect")
      return profileActionSpan(
        options,
        "engine:applyAction:activateEffect",
        () =>
          profileActionSpan(options, "engine:activateEffect:startOfTurn", () =>
            applyStartOfTurnAction(state, action),
          ) ??
          profileActionSpan(
            options,
            "engine:activateEffect:activatedReaction",
            () => applyActivatedReactionAction(state, action),
          ) ??
          profileActionSpan(options, "engine:activateEffect:activateMain", () =>
            applyActivateMainAction(state, action),
          ),
      );
    return illegalAction(state, `Unsupported action type: ${action.type}`);
  });
