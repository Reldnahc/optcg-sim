import type {
  Action,
  CardRef,
  CardInstance,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";
type EngineInternalBattleState = NonNullable<GameState["battle"]> & {
  counterPower?: number;
};

import {
  appendEvent,
  illegalAction,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { reifyCardRef } from "./action-state.js";
import { withAllAttackTimingCombatMetadataHidden } from "./attack-timing.js";
import { getUnsupportedCombatViewMetadataReason } from "./battle-combat-view-support.js";
import { getUnsupportedDamageStepContinuationReason } from "./battle-damage-step-continuation.js";
import {
  counterPayCostDecisionId,
  parseCounterPayCostDecisionId,
} from "./battle-counter-event-payment-context.js";
import { getCounterEventPaymentLegalActions } from "./battle-counter-event-payment-actions.js";
import { createCounterEventPowerRecord } from "./battle-counter-event-power-record.js";
import {
  continueCounterEventTrailingSequence,
  type CounterEventTrailingSequence,
} from "./battle-counter-event-trailing-sequence.js";
import {
  getUnsupportedBattleEffectMetadataReason,
  hasUnsupportedBattleEffectMetadata,
  isSupportedBattleResolutionEnvelope,
  sameCardRef,
} from "./battle-support.js";
import {
  getSupportedCounterEventPower,
  getSupportedCounterEventPowerShapeTargets,
  getSupportedCounterEventPowerTargets,
} from "./battle-counter-event-support.js";
import { computeView } from "./compute-view.js";
import { moveConcreteCardsToTrash } from "./concrete-card-movement.js";
import { detectPendingRuntimeWork } from "./effect-runtime.js";
import { hasOnlyFieldRemovalProtections } from "./field-removal-protection.js";
import { assertGameStateInvariants } from "./invariants.js";
import { getActiveDonCount } from "./play-card-support.js";

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
    prompt: "Pass Counter Step.",
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
  const actions: LegalAction[] = [];
  if (getUnsupportedDamageStepContinuationReason(state) === undefined) {
    actions.push({
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    });
  }
  actions.push(...getLegalCharacterCounterActions(state, decision.playerId));
  return actions;
};

const getLegalCharacterCounterActions = (
  state: GameState,
  defenderId: PlayerId,
): LegalAction[] => {
  const battle = state.battle;
  const defender = state.players[defenderId];
  if (
    battle === undefined ||
    battle.step !== "counter" ||
    defender === undefined
  ) {
    return [];
  }
  const combatMetadataState = withAllAttackTimingCombatMetadataHidden(state);
  const target = reifyCardRef(state, battle.currentTarget);
  if (
    detectPendingRuntimeWork(state) !== undefined ||
    state.replacementState.length > 0 ||
    hasUnsupportedBattleEffectMetadata(combatMetadataState) ||
    !isSupportedBattleResolutionEnvelope(battle) ||
    target === null ||
    target.playerId !== defenderId ||
    (!target.isLeader && target.card.state !== "rested")
  ) {
    return [];
  }
  const attacker = reifyCardRef(state, battle.attacker);
  if (attacker === null) {
    return [];
  }
  if (battle.blocker !== undefined) {
    const blocker = reifyCardRef(state, battle.blocker);
    if (
      blocker === null ||
      blocker.isLeader ||
      !sameCardRef(battle.blocker, battle.currentTarget)
    ) {
      return [];
    }
  }
  let view: ReturnType<typeof computeView>;
  try {
    view = computeView(combatMetadataState);
  } catch {
    return [];
  }
  if (Object.keys(view.restrictions).length > 0) {
    return [];
  }
  const attackerView = view.cards[attacker.card.instanceId];
  const targetView = view.cards[target.card.instanceId];
  if (
    attackerView?.currentPower === undefined ||
    targetView?.currentPower === undefined ||
    attackerView.keywords.includes("doubleAttack") ||
    (targetView.protectedFrom.length > 0 &&
      !hasOnlyFieldRemovalProtections(targetView.protectedFrom))
  ) {
    return [];
  }
  return defender.hand.flatMap((card) => {
    const metadata = state.cardManifest.cards[card.cardId];
    const supportedEvents = getSupportedCounterEventPowerTargets(
      state,
      card,
      defenderId,
      battle.currentTarget,
    );
    if (
      !(
        (metadata?.category === "character" &&
          metadata.counter !== undefined &&
          metadata.counter > 0) ||
        supportedEvents.some(
          (supportedEvent) =>
            getActiveDonCount(defender.costArea) >= supportedEvent.printedCost,
        )
      )
    ) {
      return [];
    }
    if (metadata?.category === "event") {
      return supportedEvents.map((supportedEvent) => ({
        type: "useCounter" as const,
        cardInstanceId: card.instanceId,
        target: supportedEvent.target,
      }));
    }
    return [
      {
        type: "useCounter" as const,
        cardInstanceId: card.instanceId,
        target: battle.currentTarget,
      },
    ];
  });
};

export const applyUseCounter = (
  state: GameState,
  action: Extract<Action, { type: "useCounter" }>,
): EngineResult => {
  const decision = state.pendingDecision;
  const battle = state.battle;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    battle === undefined ||
    battle.step !== "counter"
  ) {
    return illegalAction(state, "useCounter requires an active Counter Step.");
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
  const selectedTarget = reifyCardRef(state, action.target);
  if (attacker === null || target === null || selectedTarget === null) {
    return illegalAction(state, "Battle participants are stale or invalid.");
  }
  if (target.playerId !== decision.playerId) {
    return illegalAction(
      state,
      "Counter target must be controlled by defender.",
    );
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
  if (
    detectPendingRuntimeWork(state) !== undefined ||
    state.replacementState.length > 0
  ) {
    return illegalAction(
      state,
      "Battle requires unsupported trigger or replacement processing.",
    );
  }
  const combatMetadataState = withAllAttackTimingCombatMetadataHidden(state);
  const unsupportedEffectMetadataReason =
    getUnsupportedBattleEffectMetadataReason(combatMetadataState);
  if (unsupportedEffectMetadataReason !== undefined) {
    return illegalAction(state, unsupportedEffectMetadataReason);
  }
  const unsupportedCombatViewReason =
    getUnsupportedCombatViewMetadataReason(combatMetadataState);
  if (unsupportedCombatViewReason !== undefined) {
    return illegalAction(state, unsupportedCombatViewReason);
  }
  if (!target.isLeader && target.card.state !== "rested") {
    return illegalAction(
      state,
      "Battle target is no longer a supported rested character target.",
    );
  }
  if (!isSupportedBattleResolutionEnvelope(battle)) {
    return illegalAction(
      state,
      "Battle requires unsupported blocker, step, or multi-damage behavior.",
    );
  }
  const defender = state.players[decision.playerId];
  if (defender === undefined) {
    return illegalAction(state, "Decision player mismatch.");
  }
  const handIndex = defender.hand.findIndex(
    (card) => card.instanceId === action.cardInstanceId,
  );
  const handCard = defender.hand[handIndex];
  if (handIndex < 0 || handCard === undefined) {
    return illegalAction(state, "Counter card must be in defender hand.");
  }
  const metadata = state.cardManifest.cards[handCard.cardId];
  let counterValue: number | undefined;
  let printedCost = 0;
  let usesBattleCounterPower = true;
  let trailingSequence: CounterEventTrailingSequence | undefined;
  if (
    metadata?.category === "character" &&
    metadata.counter !== undefined &&
    metadata.counter > 0
  ) {
    if (!sameCardRef(action.target, battle.currentTarget)) {
      return illegalAction(
        state,
        "Character Counter target must be current battle target.",
      );
    }
    counterValue = metadata.counter;
  } else {
    const supportedCounterEvent = getSupportedCounterEventPower(
      state,
      handCard,
      action.target,
      battle.currentTarget,
    );
    if (supportedCounterEvent === null) {
      return illegalAction(
        state,
        metadata?.category === "event"
          ? "Counter Events are unsupported in the Counter Step."
          : "Counter card must be a Character with counter.",
      );
    }
    counterValue = supportedCounterEvent.value;
    printedCost = supportedCounterEvent.printedCost;
    usesBattleCounterPower = supportedCounterEvent.usesBattleCounterPower;
    trailingSequence = supportedCounterEvent.trailingSequence;
  }
  if (
    metadata?.category === "event" &&
    getActiveDonCount(defender.costArea) < printedCost
  ) {
    return illegalAction(state, "Counter Event requires enough active DON!!.");
  }
  if (printedCost > 0) {
    const decisionId = toDecisionId(
      counterPayCostDecisionId(
        String(handCard.instanceId),
        String(action.target.instanceId),
        state.seq + 1,
      ),
    );
    const events: EngineEvent[] = [];
    appendEvent(
      state,
      events,
      "decisionCreated",
      { decisionId, decisionType: "payCost", playerId: decision.playerId },
      { type: "public" },
    );
    const nextState: GameState = {
      ...state,
      seq: toStateSeq(state.seq + 1),
      actionSeq: state.actionSeq + 1,
      pendingDecision: {
        id: decisionId,
        type: "payCost",
        playerId: decision.playerId,
        prompt: `Pay cost for ${String(handCard.cardId)}`,
        causedBy: {
          type: "playerAction",
          actionId: `action:${String(state.actionSeq + 1)}`,
        },
        visibility: { type: "public" },
        cost: { type: "restDon", count: printedCost },
        paymentOptions: [
          { id: "restDon", type: "restDon", count: printedCost },
        ],
      },
      eventJournal: [...state.eventJournal, ...events],
    };
    assertGameStateInvariants(nextState);
    return toEngineResult(nextState, events);
  }

  const counterResult = resolveCounterCardUse({
    state,
    decisionPlayerId: decision.playerId,
    battle,
    handCard,
    target: action.target,
    counterValue,
    usesBattleCounterPower,
    ...(trailingSequence === undefined ? {} : { trailingSequence }),
    costArea: defender.costArea,
    decisionResolvedId: undefined,
    pendingDecision: state.pendingDecision,
    priorEvents: [],
  });
  return counterResult;
};

const resolveCounterCardUse = (params: {
  state: GameState;
  decisionPlayerId: PlayerId;
  battle: NonNullable<GameState["battle"]>;
  handCard: CardInstance;
  target: CardRef;
  counterValue: number;
  usesBattleCounterPower: boolean;
  trailingSequence?: CounterEventTrailingSequence;
  costArea: GameState["players"][PlayerId]["costArea"];
  decisionResolvedId: string | undefined;
  pendingDecision: GameState["pendingDecision"] | undefined;
  priorEvents: readonly EngineEvent[];
}): EngineResult => {
  const {
    state,
    decisionPlayerId,
    battle,
    handCard,
    target,
    counterValue,
    usesBattleCounterPower,
    trailingSequence,
    costArea,
    decisionResolvedId,
    pendingDecision,
    priorEvents,
  } = params;
  const defender = state.players[decisionPlayerId];
  if (defender === undefined) {
    return illegalAction(state, "Decision player mismatch.");
  }
  const events: EngineEvent[] = [];
  if (decisionResolvedId !== undefined) {
    appendEvent(
      state,
      events,
      "decisionResolved",
      { decisionId: decisionResolvedId, playerId: decisionPlayerId },
      { type: "public" },
    );
  }
  appendEvent(state, events, "counterUsed", {
    playerId: decisionPlayerId,
    instanceId: handCard.instanceId,
    cardId: handCard.cardId,
    target,
    value: counterValue,
  });
  const movedResult = moveConcreteCardsToTrash(state, events, [handCard], {
    cardMovedPayloadShape: "zoneRefs",
    cardMovedVisibility: { type: "public" },
    cardTrashedVisibility: { type: "public" },
    clearAttachedDon: true,
    emitCardTrashed: true,
    includeCardIdentityInCardMoved: true,
    playerId: decisionPlayerId,
    reason: "counter",
    sourceZone: "hand",
  });
  const movedDefender = movedResult.state.players[decisionPlayerId];
  if (movedDefender === undefined) {
    return illegalAction(state, "Decision player mismatch.");
  }
  const trashedCard = movedDefender.trash.find(
    (card) => card.instanceId === handCard.instanceId,
  );
  if (trashedCard === undefined) {
    return illegalAction(state, "Counter card movement failed.");
  }
  if (state.cardManifest.cards[handCard.cardId]?.category === "event") {
    appendEvent(
      state,
      events,
      "effectResolved",
      {
        source: {
          instanceId: handCard.instanceId,
          cardId: handCard.cardId,
          playerId: decisionPlayerId,
        },
        effectId: `${String(handCard.cardId)}:counter`,
        target,
      },
      { type: "public" },
    );
  }

  const nextBattle: EngineInternalBattleState = {
    ...battle,
  };
  if (usesBattleCounterPower) {
    nextBattle.counterPower =
      ((battle as EngineInternalBattleState).counterPower ?? 0) + counterValue;
  }
  const counterEventPowerRecord =
    !usesBattleCounterPower &&
    state.cardManifest.cards[handCard.cardId]?.category === "event"
      ? createCounterEventPowerRecord(
          state,
          decisionPlayerId,
          handCard,
          target,
          counterValue,
        )
      : null;
  if (!usesBattleCounterPower && counterEventPowerRecord === null) {
    return illegalAction(state, "Unsupported Counter Event target.");
  }
  const nextState: GameState = {
    ...movedResult.state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...movedResult.state.players,
      [decisionPlayerId]: {
        ...movedDefender,
        costArea,
      },
    },
    battle: nextBattle,
    continuousEffects:
      counterEventPowerRecord === null
        ? state.continuousEffects
        : [...state.continuousEffects, counterEventPowerRecord],
    eventJournal: [...state.eventJournal, ...events],
  };
  if (pendingDecision !== undefined && trailingSequence === undefined) {
    nextState.pendingDecision = pendingDecision;
  } else {
    delete nextState.pendingDecision;
  }
  if (trailingSequence !== undefined) {
    const trailing = continueCounterEventTrailingSequence(
      nextState,
      decisionPlayerId,
      trashedCard,
      trailingSequence,
      pendingDecision,
    );
    if (trailing === null) {
      return illegalAction(state, "Unsupported Counter Event trailing effect.");
    }
    assertGameStateInvariants(trailing.state);
    return toEngineResult(trailing.state, [
      ...priorEvents,
      ...events,
      ...trailing.events,
    ]);
  }
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, [...priorEvents, ...events]);
};

export const applyCounterStepDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  resolveSupportedVanillaBattle: (state: GameState) => EngineResult,
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
    if (action.response.type !== "payment") {
      return illegalAction(state, "Unsupported decision response.");
    }
    const context = parseCounterPayCostDecisionId(String(decision.id));
    if (context === null) {
      return illegalAction(state, "Unsupported payCost decision context.");
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
    if (selectedTarget === undefined) {
      return illegalAction(state, "Unsupported payCost decision context.");
    }
    const supportedCounterEvent = getSupportedCounterEventPower(
      state,
      handCard,
      selectedTarget.target,
      battle.currentTarget,
    );
    if (
      supportedCounterEvent === null ||
      supportedCounterEvent.printedCost <= 0
    ) {
      return illegalAction(state, "Unsupported payCost decision context.");
    }
    if (action.response.optionId !== "restDon") {
      return illegalAction(state, "Payment option mismatch.");
    }
    const selected = action.response.selectedDonInstanceIds;
    if (
      selected === undefined ||
      selected.length !== supportedCounterEvent.printedCost
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

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    { decisionId: decision.id, playerId: decision.playerId },
    { type: "public" },
  );
  const resumedState: GameState = {
    ...state,
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  delete resumedState.pendingDecision;
  const resolved = resolveSupportedVanillaBattle(resumedState);
  if (resolved.errors !== undefined) {
    return resolved;
  }
  return toEngineResult(resolved.state, [...events, ...resolved.events]);
};

const unsupportedCounterEventReason =
  "Counter Events are unsupported in the Counter Step.";

const hasRawCounterText = (value: string | undefined): boolean =>
  value !== undefined && /\[counter\]/i.test(value);

const hasCounterTriggerDefinition = (
  state: GameState,
  cardId: CardInstance["cardId"],
): boolean =>
  Object.values(state.cardManifest.effectDefinitions ?? {}).some(
    (definition) =>
      definition.cardId === cardId &&
      definition.effects.some((effect) => effect.trigger.type === "counter"),
  );

const isUnsupportedCounterEventCandidate = (
  state: GameState,
  card: CardInstance,
  defenderId: PlayerId,
  battleTarget: CardRef | undefined,
): boolean => {
  if (
    getSupportedCounterEventPowerShapeTargets(
      state,
      card,
      defenderId,
      battleTarget,
    ).length > 0
  ) {
    return false;
  }
  const metadata = state.cardManifest.cards[card.cardId];
  return (
    metadata?.category === "event" &&
    ((metadata.counter !== undefined && metadata.counter > 0) ||
      hasRawCounterText(metadata.effectText) ||
      hasRawCounterText(metadata.triggerText) ||
      hasCounterTriggerDefinition(state, card.cardId))
  );
};

export const getUnsupportedCounterWindowReason = (
  state: GameState,
  defenderId: PlayerId,
): string | undefined => {
  const defender = state.players[defenderId];
  const target = state.battle?.currentTarget;
  if (defender === undefined) {
    return "Battle requires unsupported counter window handling.";
  }
  for (const card of defender.hand) {
    const metadata = state.cardManifest.cards[card.cardId];
    if (metadata === undefined) {
      return "Battle requires unsupported counter window handling.";
    }
    if (isUnsupportedCounterEventCandidate(state, card, defenderId, target)) {
      return unsupportedCounterEventReason;
    }
    if (
      getSupportedCounterEventPowerShapeTargets(state, card, defenderId, target)
        .length === 0 &&
      hasCounterTriggerDefinition(state, card.cardId)
    ) {
      return "Battle requires unsupported counter window handling.";
    }
  }
  return undefined;
};

export const hasUnsupportedCounterWindow = (
  state: GameState,
  defenderId: PlayerId,
): boolean =>
  getUnsupportedCounterWindowReason(state, defenderId) !== undefined;

const hasPotentialCharacterCounterActions = (
  state: GameState,
  defenderId: PlayerId,
): boolean => {
  const target = state.battle?.currentTarget;
  const defender = state.players[defenderId];
  if (defender === undefined) {
    return false;
  }
  return defender.hand.some((card) => {
    const metadata = state.cardManifest.cards[card.cardId];
    const supportedEvents = getSupportedCounterEventPowerTargets(
      state,
      card,
      defenderId,
      target,
    );
    return (
      (metadata?.category === "character" &&
        metadata.counter !== undefined &&
        metadata.counter > 0) ||
      supportedEvents.some(
        (supportedEvent) =>
          getActiveDonCount(defender.costArea) >= supportedEvent.printedCost,
      )
    );
  });
};

export const enterCounterStepOrAutoPass = (
  state: GameState,
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
  const decision = createCounterStepPassDecision(counterState);
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
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};
