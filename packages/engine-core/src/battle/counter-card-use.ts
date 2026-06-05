import type {
  Action,
  CardRef,
  CardInstance,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  OptionalCost,
  PlayerId,
  SelectTargetsDecision,
  TargetCandidate,
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
} from "../action-results.js";
import { reifyCardRef } from "../actions/state.js";
import { withAllAttackTimingCombatMetadataHidden } from "./attack-timing.js";
import { getUnsupportedCombatViewMetadataReason } from "./combat-view-support.js";
import {
  counterPayCostDecisionId,
  counterTargetDecisionId,
} from "./counter-event-payment-context.js";
import { createCounterEventPowerRecord } from "./counter-event-power-record.js";
import {
  continueCounterEventTrailingSequence,
  type CounterEventTrailingSequence,
} from "./counter-event-trailing-sequence.js";
import {
  getSupportedCounterEventPower,
  getSupportedCounterEventPowerTargets,
  type SupportedCounterEventPower,
} from "./counter-event-support.js";
import {
  getUnsupportedBattleEffectMetadataReason,
  hasUnsupportedBattleEffectMetadata,
  isSupportedBattleResolutionEnvelope,
  sameCardRef,
} from "./support.js";
import { computeView } from "../view/compute-view.js";
import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import { detectPendingRuntimeWork } from "../effect-runtime.js";
import { hasOnlyFieldRemovalProtections } from "../replacement/field-removal-protection.js";
import { assertGameStateInvariants } from "../state/invariants.js";
import { getActiveDonCount } from "../play-card/support.js";
import { getUnsupportedCounterWindowReason } from "./counter-window-support.js";
import { getEffectiveCharacterCounterValue } from "./effective-counter.js";

type CreateCounterStepPassDecision = (
  state: GameState,
  options?: { requirePotentialCounterActions?: boolean },
) => NonNullable<GameState["pendingDecision"]> | null;

export const getLegalCharacterCounterActions = (
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
          (getEffectiveCharacterCounterValue(state, card) ?? 0) > 0) ||
        supportedEvents.some(
          (supportedEvent) =>
            getActiveDonCount(defender.costArea) >= supportedEvent.printedCost,
        )
      )
    ) {
      return [];
    }
    if (metadata?.category === "event") {
      if (
        supportedEvents.some(
          (supportedEvent) =>
            supportedEvent.effectCost !== undefined &&
            getActiveDonCount(defender.costArea) >= supportedEvent.printedCost,
        )
      ) {
        return [
          {
            type: "useCounter" as const,
            cardInstanceId: card.instanceId,
            target: battle.currentTarget,
          },
        ];
      }
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
  let effectCost: Extract<OptionalCost, { type: "trashFromHand" }> | undefined;
  const effectiveCharacterCounter = getEffectiveCharacterCounterValue(
    state,
    handCard,
  );
  if (
    metadata?.category === "character" &&
    effectiveCharacterCounter !== undefined &&
    effectiveCharacterCounter > 0
  ) {
    if (!sameCardRef(action.target, battle.currentTarget)) {
      return illegalAction(
        state,
        "Character Counter target must be current battle target.",
      );
    }
    counterValue = effectiveCharacterCounter;
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
    effectCost = supportedCounterEvent.effectCost;
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
        "printed",
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
  if (effectCost !== undefined) {
    return createCounterEventEffectCostDecision({
      battle,
      cost: effectCost,
      decisionPlayerId: decision.playerId,
      handCard,
      state,
      target: action.target,
    });
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

export const createCounterEventEffectCostDecision = (params: {
  battle: NonNullable<GameState["battle"]>;
  cost: Extract<OptionalCost, { type: "trashFromHand" }>;
  decisionPlayerId: PlayerId;
  handCard: CardInstance;
  state: GameState;
  target: CardRef;
}): EngineResult => {
  const defender = params.state.players[params.decisionPlayerId];
  if (defender === undefined) {
    return illegalAction(params.state, "Decision player mismatch.");
  }
  const eligibleCount = defender.hand.filter(
    (card) => card.instanceId !== params.handCard.instanceId,
  ).length;
  if (eligibleCount < params.cost.count) {
    return illegalAction(params.state, "Counter Event cost cannot be paid.");
  }
  const decisionId = toDecisionId(
    counterPayCostDecisionId(
      String(params.handCard.instanceId),
      String(params.target.instanceId),
      params.state.seq + 1,
      "effect",
    ),
  );
  const events: EngineEvent[] = [];
  appendEvent(
    params.state,
    events,
    "decisionCreated",
    {
      decisionId,
      decisionType: "payCost",
      playerId: params.decisionPlayerId,
    },
    { type: "public" },
  );
  const nextState: GameState = {
    ...params.state,
    seq: toStateSeq(params.state.seq + 1),
    actionSeq: params.state.actionSeq + 1,
    battle: params.battle,
    pendingDecision: {
      id: decisionId,
      type: "payCost",
      playerId: params.decisionPlayerId,
      prompt: `Pay cost for ${String(params.handCard.cardId)}`,
      causedBy: {
        type: "playerAction",
        actionId: `action:${String(params.state.actionSeq + 1)}`,
      },
      visibility: { type: "public" },
      cost: params.cost,
      paymentOptions: [
        {
          id: "trashFromHand",
          type: "trashFromHand",
          count: params.cost.count,
        },
      ],
      defaultResponse: { type: "paymentDeclined" },
    },
    eventJournal: [...params.state.eventJournal, ...events],
  };
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

const counterEventTargetRequest = (): SelectTargetsDecision["request"] => ({
  timing: "onResolution",
  chooser: "self",
  player: "self",
  zones: ["leaderArea", "characterArea"],
  min: 0,
  max: 1,
  allowFewerIfUnavailable: true,
  visibility: "public",
  filter: { categories: ["leader", "character"] },
});

const counterEventTargetCandidates = (
  supportedTargets: readonly SupportedCounterEventPower[],
): TargetCandidate[] =>
  supportedTargets.map((supportedTarget) => ({
    card: supportedTarget.target,
    visibility: { type: "public" },
  }));

const createCounterEventTargetDecision = (params: {
  counterEvent: CardInstance;
  decisionPlayerId: PlayerId;
  previousDecisionId: SelectTargetsDecision["id"];
  state: GameState;
  supportedTargets: readonly SupportedCounterEventPower[];
}): SelectTargetsDecision => ({
  id: toDecisionId(
    counterTargetDecisionId(
      String(params.counterEvent.instanceId),
      params.state.seq + 1,
    ),
  ),
  type: "selectTargets",
  playerId: params.decisionPlayerId,
  prompt: "Choose Counter target.",
  causedBy: { type: "decision", decisionId: params.previousDecisionId },
  visibility: { type: "public" },
  request: counterEventTargetRequest(),
  candidates: counterEventTargetCandidates(params.supportedTargets),
  defaultResponse: { type: "targets", targets: [] },
});

export const applyCounterEventEffectCostDecisionResponse = (params: {
  action: Extract<Action, { type: "respondToDecision" }>;
  battle: NonNullable<GameState["battle"]>;
  createCounterStepPassDecision: CreateCounterStepPassDecision;
  decision: Extract<
    NonNullable<GameState["pendingDecision"]>,
    { type: "payCost" }
  >;
  defender: NonNullable<GameState["players"][PlayerId]>;
  handCard: CardInstance;
  state: GameState;
  supportedCounterEvent: SupportedCounterEventPower;
}): EngineResult => {
  const {
    action,
    battle,
    createCounterStepPassDecision,
    decision,
    defender,
    handCard,
    state,
    supportedCounterEvent,
  } = params;
  const effectCost = supportedCounterEvent.effectCost;
  if (effectCost === undefined) {
    return illegalAction(state, "Unsupported payCost decision context.");
  }
  if (action.response.type === "paymentDeclined") {
    return resolveCounterCardUse({
      state,
      decisionPlayerId: decision.playerId,
      battle,
      handCard,
      target: battle.currentTarget,
      counterValue: 0,
      usesBattleCounterPower: false,
      costArea: defender.costArea,
      decisionResolvedId: decision.id,
      applyCounterPower: false,
      pendingDecision:
        createCounterStepPassDecision(state, {
          requirePotentialCounterActions: false,
        }) ?? undefined,
      priorEvents: [],
    });
  }
  if (action.response.type !== "payment") {
    return illegalAction(state, "Unsupported decision response.");
  }
  if (action.response.optionId !== "trashFromHand") {
    return illegalAction(state, "Payment option mismatch.");
  }
  const selected = action.response.selectedCardInstanceIds;
  if (selected === undefined || selected.length !== effectCost.count) {
    return illegalAction(state, "Payment card selection count mismatch.");
  }
  if (new Set(selected).size !== selected.length) {
    return illegalAction(state, "Payment card selection contains duplicates.");
  }
  if (selected.includes(handCard.instanceId)) {
    return illegalAction(state, "Counter Event cannot pay its own cost.");
  }
  const handById = new Map(
    defender.hand.map((card) => [card.instanceId, card]),
  );
  const selectedCards: CardInstance[] = [];
  for (const cardId of selected) {
    const card = handById.get(cardId);
    if (card === undefined) {
      return illegalAction(state, "Payment card selection is invalid.");
    }
    selectedCards.push(card);
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    { decisionId: decision.id, playerId: decision.playerId },
    { type: "public" },
  );
  appendEvent(
    state,
    events,
    "costPaid",
    {
      playerId: decision.playerId,
      optionId: "trashFromHand",
      selectedCardInstanceIds: selected,
    },
    { type: "public" },
  );
  const movedCost = moveConcreteCardsToTrash(state, events, selectedCards, {
    cardMovedPayloadShape: "zoneRefs",
    cardMovedVisibility: { type: "public" },
    cardTrashedVisibility: { type: "public" },
    clearAttachedDon: true,
    emitCardTrashed: true,
    includeCardIdentityInCardMoved: true,
    playerId: decision.playerId,
    reason: "trashFromHand",
    sourceZone: "hand",
  });
  const costState: GameState = {
    ...movedCost.state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  const supportedTargets = getSupportedCounterEventPowerTargets(
    costState,
    handCard,
    decision.playerId,
    battle.currentTarget,
    { effectCostPaid: true },
  );
  if (supportedTargets.length === 0) {
    return illegalAction(state, "Unsupported Counter Event target.");
  }
  const targetDecision = createCounterEventTargetDecision({
    counterEvent: handCard,
    decisionPlayerId: decision.playerId,
    previousDecisionId: decision.id,
    state: costState,
    supportedTargets,
  });
  const decisionEvents: EngineEvent[] = [];
  appendEvent(
    costState,
    decisionEvents,
    "decisionCreated",
    {
      decisionId: targetDecision.id,
      decisionType: targetDecision.type,
      playerId: decision.playerId,
    },
    { type: "public" },
  );
  const nextState: GameState = {
    ...costState,
    pendingDecision: targetDecision,
    eventJournal: [...costState.eventJournal, ...decisionEvents],
  };
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, [...events, ...decisionEvents]);
};

const cardRefsMatch = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId;

export const applyCounterEventTargetDecisionResponse = (params: {
  action: Extract<Action, { type: "respondToDecision" }>;
  battle: NonNullable<GameState["battle"]>;
  createCounterStepPassDecision: CreateCounterStepPassDecision;
  decision: Extract<
    NonNullable<GameState["pendingDecision"]>,
    { type: "selectTargets" }
  >;
  defender: NonNullable<GameState["players"][PlayerId]>;
  handCard: CardInstance;
  state: GameState;
}): EngineResult => {
  const {
    action,
    battle,
    createCounterStepPassDecision,
    decision,
    defender,
    handCard,
    state,
  } = params;
  if (action.response.type !== "targets") {
    return illegalAction(state, "Unsupported decision response.");
  }
  if (action.response.targets.length > 1) {
    return illegalAction(state, "Selected target count exceeds maximum.");
  }
  const supportedTargets = getSupportedCounterEventPowerTargets(
    state,
    handCard,
    decision.playerId,
    battle.currentTarget,
    { effectCostPaid: true },
  );
  const target = action.response.targets[0];
  const selectedTarget =
    target === undefined
      ? undefined
      : supportedTargets.find((supportedTarget) =>
          cardRefsMatch(supportedTarget.target, target),
        );
  if (target !== undefined && selectedTarget === undefined) {
    return illegalAction(state, "Selected target is invalid.");
  }
  const fallbackTarget = supportedTargets.find((supportedTarget) =>
    cardRefsMatch(supportedTarget.target, battle.currentTarget),
  );
  const resolvedTarget = selectedTarget ?? fallbackTarget;
  if (resolvedTarget === undefined) {
    return illegalAction(state, "Unsupported Counter Event target.");
  }
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    { decisionId: decision.id, playerId: decision.playerId },
    { type: "public" },
  );
  return resolveCounterCardUse({
    state,
    decisionPlayerId: decision.playerId,
    battle,
    handCard,
    target: resolvedTarget.target,
    counterValue: selectedTarget === undefined ? 0 : selectedTarget.value,
    usesBattleCounterPower:
      selectedTarget !== undefined && selectedTarget.usesBattleCounterPower,
    ...(resolvedTarget.trailingSequence === undefined
      ? {}
      : { trailingSequence: resolvedTarget.trailingSequence }),
    costArea: defender.costArea,
    decisionResolvedId: undefined,
    applyCounterPower: selectedTarget !== undefined,
    pendingDecision:
      createCounterStepPassDecision(state, {
        requirePotentialCounterActions: false,
      }) ?? undefined,
    priorEvents: events,
  });
};

export const resolveCounterCardUse = (params: {
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
  applyCounterPower?: boolean;
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
    applyCounterPower = true,
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
  const isCounterEvent =
    state.cardManifest.cards[handCard.cardId]?.category === "event";
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
  if (isCounterEvent) {
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
  if (applyCounterPower && usesBattleCounterPower) {
    nextBattle.counterPower =
      ((battle as EngineInternalBattleState).counterPower ?? 0) + counterValue;
  }
  const counterEventPowerRecord =
    applyCounterPower && !usesBattleCounterPower && isCounterEvent
      ? createCounterEventPowerRecord(
          state,
          decisionPlayerId,
          handCard,
          target,
          counterValue,
        )
      : null;
  if (
    applyCounterPower &&
    !usesBattleCounterPower &&
    counterEventPowerRecord === null
  ) {
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
  const resumePendingDecision = isCounterEvent ? undefined : pendingDecision;
  if (resumePendingDecision !== undefined && trailingSequence === undefined) {
    nextState.pendingDecision = resumePendingDecision;
  } else {
    delete nextState.pendingDecision;
  }
  if (trailingSequence !== undefined) {
    const trailing = continueCounterEventTrailingSequence(
      nextState,
      decisionPlayerId,
      trashedCard,
      trailingSequence,
      resumePendingDecision,
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
