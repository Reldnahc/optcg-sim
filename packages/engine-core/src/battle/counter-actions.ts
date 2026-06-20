import type {
  Action,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import {
  appendEvent,
  assertGameStateInvariantsIfEnabled,
  type EngineResultOptions,
  illegalAction,
  toDecisionId,
  toEngineResult,
} from "../action-results.js";
import { reifyCardRef } from "../actions/state.js";
import { getUnsupportedDamageStepContinuationReason } from "./damage-step-continuation.js";
import {
  parseCounterPayCostDecisionId,
  parseCounterTargetDecisionId,
} from "./counter-event-payment-context.js";
import { getCounterEventPaymentLegalActions } from "./counter-event-payment-actions.js";
import {
  isSupportedBattleResolutionEnvelope,
  isSupportedCounterStepTarget,
  sameCardRef,
} from "./support.js";
import {
  getSupportedCounterEventPower,
  getSupportedCounterEventPowerTargets,
  getSupportedCounterEventRuntime,
  getSupportedCounterEventSequence,
} from "./counter-event-support.js";
import { detectPendingRuntimeWork } from "../effect-runtime.js";
import {
  getUnsupportedCounterWindowReason,
  hasPotentialCharacterCounterActions,
  hasUnsupportedCounterWindow,
} from "./counter-window-support.js";
import {
  applyCounterEventEffectCostDecisionResponse,
  applyCounterEventTargetDecisionResponse,
  createCounterEventEffectCostDecision,
  getLegalCharacterCounterActions,
  resolveCounterCardUse,
} from "./counter-card-use.js";
import { prependEventsToEngineResult } from "../engine-result-events.js";

export { applyUseCounter } from "./counter-card-use.js";
export {
  getUnsupportedCounterWindowReason,
  hasUnsupportedCounterWindow,
} from "./counter-window-support.js";

export const createCounterStepPassDecision = (
  state: GameState,
  options: { requirePotentialCounterActions?: boolean } = {},
): NonNullable<GameState["pendingDecision"]> | null => {
  const requirePotentialCounterActions =
    options.requirePotentialCounterActions ?? true;
  const battle = state.battle;
  if (battle === undefined || battle.step !== "counter") {
    return null;
  }
  const target = reifyCardRef(state, battle.currentTarget);
  if (target === null) {
    return null;
  }
  if (hasUnsupportedCounterWindow(state, target.playerId)) {
    return null;
  }
  if (
    requirePotentialCounterActions &&
    !hasPotentialCharacterCounterActions(state, target.playerId)
  ) {
    return null;
  }
  const attacker = reifyCardRef(state, battle.attacker);
  if (attacker === null) {
    return null;
  }
  return {
    id: toDecisionId(
      `decision:counterStep:pass:${String(attacker.card.instanceId)}:${String(state.seq + 1)}`,
    ),
    type: "selectCards",
    playerId: target.playerId,
    prompt: "Use counter or end step.",
    causedBy: {
      type: "playerAction",
      actionId: `action:${String(state.actionSeq)}`,
    },
    visibility: { type: "public" },
    request: {
      timing: "onActivation",
      chooser: "nonTurnPlayer",
      player: "nonTurnPlayer",
      zone: "hand",
      filter: { categories: ["character"] },
      min: 0,
      max: 0,
      allowFewerIfUnavailable: true,
      visibility: "privateToChooser",
    },
    candidates: [],
    defaultResponse: { type: "cards", cards: [] },
  };
};

export const getCounterStepDecisionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  const battle = state.battle;
  if (
    decision !== undefined &&
    decision.type === "selectTargets" &&
    decision.playerId === playerId &&
    battle !== undefined &&
    battle.step === "counter" &&
    parseCounterTargetDecisionId(String(decision.id)) !== null
  ) {
    return [
      {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "targets", targets: [] },
      },
    ];
  }
  if (
    decision !== undefined &&
    decision.type === "payCost" &&
    decision.playerId === playerId &&
    battle !== undefined &&
    battle.step === "counter"
  ) {
    return getCounterEventPaymentLegalActions(state, playerId);
  }
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    decision.playerId !== playerId ||
    battle === undefined ||
    battle.step !== "counter" ||
    decision.request.min !== 0 ||
    decision.request.max !== 0 ||
    decision.defaultResponse?.type !== "cards" ||
    decision.defaultResponse.cards.length !== 0 ||
    decision.candidates.length !== 0 ||
    hasUnsupportedCounterWindow(state, decision.playerId)
  ) {
    return [];
  }
  const actions: LegalAction[] = canOfferCounterStepPassAction(state)
    ? [
        {
          type: "respondToDecision",
          decisionId: decision.id,
          response: { type: "cards", cards: [] },
        },
      ]
    : [];
  actions.push(...getLegalCharacterCounterActions(state, decision.playerId));
  return actions;
};

const canOfferCounterStepPassAction = (state: GameState): boolean => {
  const battle = state.battle;
  // Runtime work is resolved by the action/decision continuation path; legal actions stay hidden while it is pending.
  if (
    battle === undefined ||
    battle.step !== "counter" ||
    detectPendingRuntimeWork(state) !== undefined ||
    state.replacementState.length > 0 ||
    !isSupportedBattleResolutionEnvelope(battle)
  ) {
    return false;
  }
  const attacker = reifyCardRef(state, battle.attacker);
  const target = reifyCardRef(state, battle.currentTarget);
  if (attacker === null || target === null) {
    return false;
  }
  if (!isSupportedCounterStepTarget(battle, target)) {
    return false;
  }
  if (battle.blocker === undefined) {
    return true;
  }
  const blocker = reifyCardRef(state, battle.blocker);
  return (
    blocker !== null &&
    !blocker.isLeader &&
    sameCardRef(battle.blocker, battle.currentTarget)
  );
};

export const applyCounterStepDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  resolveSupportedVanillaBattle: (
    state: GameState,
    options?: EngineResultOptions,
  ) => EngineResult,
  options: EngineResultOptions = {},
): EngineResult | null => {
  const decision = state.pendingDecision;
  const battle = state.battle;
  if (
    decision === undefined ||
    battle === undefined ||
    battle.step !== "counter"
  ) {
    return null;
  }
  if (decision.type === "payCost") {
    if (
      action.response.type !== "payment" &&
      action.response.type !== "paymentDeclined"
    ) {
      return illegalAction(state, "Unsupported decision response.");
    }
    const context = parseCounterPayCostDecisionId(String(decision.id));
    if (context === null) {
      return null;
    }
    const defender = state.players[decision.playerId];
    if (defender === undefined) {
      return illegalAction(state, "Decision player mismatch.");
    }
    const handIndex = defender.hand.findIndex(
      (card) => String(card.instanceId) === context.counterEventInstanceId,
    );
    if (handIndex < 0) {
      return illegalAction(state, "Decision card reference is stale.");
    }
    const handCard = defender.hand[handIndex];
    if (handCard === undefined) {
      return illegalAction(state, "Decision card not found.");
    }
    const supportedTargets = getSupportedCounterEventPowerTargets(
      state,
      handCard,
      decision.playerId,
      battle.currentTarget,
    );
    const selectedTarget = supportedTargets.find(
      (supportedTarget) =>
        String(supportedTarget.target.instanceId) === context.targetInstanceId,
    );
    const selectedRuntimeTarget =
      String(battle.currentTarget.instanceId) === context.targetInstanceId
        ? battle.currentTarget
        : undefined;
    if (selectedTarget === undefined && selectedRuntimeTarget === undefined) {
      return illegalAction(state, "Unsupported payCost decision context.");
    }
    const supportedCounterEvent = getSupportedCounterEventPower(
      state,
      handCard,
      selectedTarget?.target,
      battle.currentTarget,
    );
    const supportedRuntimeEvent =
      supportedCounterEvent === null
        ? getSupportedCounterEventRuntime(
            state,
            handCard,
            selectedRuntimeTarget,
          )
        : null;
    const supportedSequenceEvent =
      supportedCounterEvent === null && supportedRuntimeEvent === null
        ? getSupportedCounterEventSequence(
            state,
            handCard,
            selectedRuntimeTarget,
          )
        : null;
    if (
      (supportedCounterEvent === null &&
        supportedRuntimeEvent === null &&
        supportedSequenceEvent === null) ||
      (context.kind === "printed" &&
        (supportedCounterEvent?.printedCost ??
          supportedRuntimeEvent?.printedCost ??
          supportedSequenceEvent?.printedCost ??
          0) <= 0) ||
      (context.kind === "effect" &&
        supportedCounterEvent?.effectCost === undefined)
    ) {
      return illegalAction(state, "Unsupported payCost decision context.");
    }
    if (context.kind === "effect") {
      if (supportedCounterEvent === null) {
        return illegalAction(state, "Unsupported payCost decision context.");
      }
      return applyCounterEventEffectCostDecisionResponse({
        action,
        battle,
        createCounterStepPassDecision,
        decision,
        defender,
        handCard,
        options,
        state,
        supportedCounterEvent,
      });
    }
    if (action.response.type !== "payment") {
      return illegalAction(state, "Unsupported decision response.");
    }
    if (action.response.optionId !== "restDon") {
      return illegalAction(state, "Payment option mismatch.");
    }
    const selected = action.response.selectedDonInstanceIds;
    const printedCost =
      supportedCounterEvent?.printedCost ??
      supportedRuntimeEvent?.printedCost ??
      supportedSequenceEvent?.printedCost;
    if (
      selected === undefined ||
      printedCost === undefined ||
      selected.length !== printedCost
    ) {
      return illegalAction(state, "Payment DON!! selection count mismatch.");
    }
    if (new Set(selected).size !== selected.length) {
      return illegalAction(
        state,
        "Payment DON!! selection contains duplicates.",
      );
    }
    const costAreaById = new Map(
      defender.costArea.map((card) => [card.instanceId, card]),
    );
    for (const donId of selected) {
      const don = costAreaById.get(donId);
      if (don === undefined || don.state !== "active") {
        return illegalAction(state, "Payment DON!! selection is invalid.");
      }
    }
    const restedSet = new Set(selected);
    const nextCostArea = defender.costArea.map((card) =>
      restedSet.has(card.instanceId)
        ? { ...card, state: "rested" as const }
        : card,
    );
    const events: EngineEvent[] = [];
    appendEvent(
      state,
      events,
      "costPaid",
      {
        playerId: decision.playerId,
        optionId: "restDon",
        selectedDonInstanceIds: selected,
      },
      { type: "public" },
    );
    const stagedState: GameState = {
      ...state,
      eventJournal: [...state.eventJournal, ...events],
    };
    if (supportedCounterEvent?.effectCost !== undefined) {
      if (selectedTarget === undefined) {
        return illegalAction(state, "Unsupported payCost decision context.");
      }
      const costState: GameState = {
        ...stagedState,
        players: {
          ...stagedState.players,
          [decision.playerId]: {
            ...defender,
            costArea: nextCostArea,
          },
        },
      };
      const effectCostDecision = createCounterEventEffectCostDecision({
        battle,
        cost: supportedCounterEvent.effectCost,
        decisionPlayerId: decision.playerId,
        handCard,
        options,
        state: costState,
        target: selectedTarget.target,
      });
      return prependEventsToEngineResult(effectCostDecision, events, options);
    }
    if (supportedRuntimeEvent !== null) {
      return resolveCounterCardUse({
        state: stagedState,
        decisionPlayerId: decision.playerId,
        battle,
        handCard,
        target: supportedRuntimeEvent.target,
        counterValue: 0,
        usesBattleCounterPower: false,
        runtimeEffects: supportedRuntimeEvent.effects,
        costArea: nextCostArea,
        decisionResolvedId: decision.id,
        applyCounterPower: false,
        pendingDecision:
          createCounterStepPassDecision(stagedState, {
            requirePotentialCounterActions: false,
          }) ?? undefined,
        priorEvents: events,
        options,
      });
    }
    if (supportedSequenceEvent !== null) {
      return resolveCounterCardUse({
        state: stagedState,
        decisionPlayerId: decision.playerId,
        battle,
        handCard,
        target: supportedSequenceEvent.target,
        counterValue: 0,
        usesBattleCounterPower: false,
        sequenceEffects: supportedSequenceEvent.effects,
        costArea: nextCostArea,
        decisionResolvedId: decision.id,
        applyCounterPower: false,
        pendingDecision:
          createCounterStepPassDecision(stagedState, {
            requirePotentialCounterActions: false,
          }) ?? undefined,
        priorEvents: events,
        options,
      });
    }
    if (supportedCounterEvent === null || selectedTarget === undefined) {
      return illegalAction(state, "Unsupported payCost decision context.");
    }
    return resolveCounterCardUse({
      state: stagedState,
      decisionPlayerId: decision.playerId,
      battle,
      handCard,
      target: selectedTarget.target,
      counterValue: supportedCounterEvent.value,
      usesBattleCounterPower: supportedCounterEvent.usesBattleCounterPower,
      ...(supportedCounterEvent.trailingSequence === undefined
        ? {}
        : { trailingSequence: supportedCounterEvent.trailingSequence }),
      costArea: nextCostArea,
      decisionResolvedId: decision.id,
      pendingDecision:
        createCounterStepPassDecision(stagedState, {
          requirePotentialCounterActions: false,
        }) ?? undefined,
      priorEvents: events,
      options,
    });
  }
  if (decision.type === "selectTargets") {
    const context = parseCounterTargetDecisionId(String(decision.id));
    if (context === null) {
      return null;
    }
    const defender = state.players[decision.playerId];
    if (defender === undefined) {
      return illegalAction(state, "Decision player mismatch.");
    }
    const handCard = defender.hand.find(
      (card) => String(card.instanceId) === context.counterEventInstanceId,
    );
    if (handCard === undefined) {
      return illegalAction(state, "Decision card reference is stale.");
    }
    return applyCounterEventTargetDecisionResponse({
      action,
      battle,
      createCounterStepPassDecision,
      decision,
      defender,
      handCard,
      options,
      state,
    });
  }
  if (decision.type !== "selectCards") {
    return null;
  }
  if (action.response.type !== "cards" || action.response.cards.length !== 0) {
    return illegalAction(state, "Counter Step decision supports pass only.");
  }
  if (
    decision.request.min !== 0 ||
    decision.request.max !== 0 ||
    decision.defaultResponse?.type !== "cards" ||
    decision.defaultResponse.cards.length !== 0 ||
    decision.candidates.length !== 0
  ) {
    return illegalAction(state, "Unsupported Counter Step decision envelope.");
  }
  const unsupportedCounterWindowReason =
    decision.playerId === state.turn.turnPlayerId
      ? "Battle requires unsupported counter window handling."
      : getUnsupportedCounterWindowReason(state, decision.playerId);
  if (unsupportedCounterWindowReason !== undefined) {
    return illegalAction(state, unsupportedCounterWindowReason);
  }
  const attacker = reifyCardRef(state, battle.attacker);
  const target = reifyCardRef(state, battle.currentTarget);
  if (attacker === null || target === null) {
    return illegalAction(state, "Battle participants are stale or invalid.");
  }
  if (battle.blocker !== undefined) {
    const blocker = reifyCardRef(state, battle.blocker);
    if (
      blocker === null ||
      blocker.isLeader ||
      !sameCardRef(battle.blocker, battle.currentTarget)
    ) {
      return illegalAction(state, "Battle blocker is stale or invalid.");
    }
  }
  const unsupportedContinuationReason =
    getUnsupportedDamageStepContinuationReason(state);
  if (unsupportedContinuationReason !== undefined) {
    return illegalAction(state, unsupportedContinuationReason);
  }

  const eventState: GameState = {
    ...state,
    actionSeq: state.actionSeq + 1,
  };
  const events: EngineEvent[] = [];
  appendEvent(
    eventState,
    events,
    "decisionResolved",
    { decisionId: decision.id, playerId: decision.playerId },
    { type: "public" },
  );
  const resumedState: GameState = {
    ...state,
    actionSeq: eventState.actionSeq,
    eventJournal: [...state.eventJournal, ...events],
  };
  delete resumedState.pendingDecision;
  const resolved = resolveSupportedVanillaBattle(resumedState, options);
  if (resolved.errors !== undefined) {
    return resolved;
  }
  return prependEventsToEngineResult(resolved, events, options);
};

export const enterCounterStepOrAutoPass = (
  state: GameState,
  options: EngineResultOptions = {},
): EngineResult | null => {
  const battle = state.battle;
  if (battle === undefined) {
    return null;
  }
  const counterState: GameState = {
    ...state,
    battle: { ...battle, step: "counter" },
  };
  const target = reifyCardRef(counterState, battle.currentTarget);
  if (target === null) {
    return illegalAction(state, "Battle participants are stale or invalid.");
  }
  const unsupportedCounterWindowReason = getUnsupportedCounterWindowReason(
    counterState,
    target.playerId,
  );
  if (unsupportedCounterWindowReason !== undefined) {
    return illegalAction(state, unsupportedCounterWindowReason);
  }
  const decision = createCounterStepPassDecision(counterState, {
    requirePotentialCounterActions: false,
  });
  if (decision === null) {
    return null;
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
    },
    { type: "public" },
  );
  const nextState: GameState = {
    ...counterState,
    pendingDecision: decision,
    eventJournal: [...state.eventJournal, ...events],
  };
  assertGameStateInvariantsIfEnabled(nextState, options);
  return toEngineResult(nextState, events, undefined, options);
};
