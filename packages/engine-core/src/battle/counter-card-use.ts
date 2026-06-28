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
  appendCombatSpotlightEntryCreatedEvent,
  appendEvent,
  assertGameStateInvariantsIfEnabled,
  type EngineResultOptions,
  illegalAction,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { reifyCardRef } from "../actions/state.js";
import { counterPayCostDecisionId } from "./counter-event-payment-context.js";
import {
  getSupportedCounterEventActivation,
  queueCounterEventEffects,
  type SupportedCounterEventActivation,
} from "./counter-event-activation.js";
import {
  isSupportedBattleResolutionEnvelope,
  isSupportedCounterStepTarget,
  sameCardRef,
} from "./support.js";
import {
  getSupportedBattleCombatView,
  getSupportedBattleCombatViewOrNull,
} from "./capabilities.js";
import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import { detectPendingRuntimeWork } from "../effect-runtime.js";
import { getActiveDonCount } from "../play-card/support.js";
import { getUnsupportedCounterWindowReason } from "./counter-window-support.js";
import { getEffectiveCharacterCounterValue } from "./effective-counter.js";

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
  const target = reifyCardRef(state, battle.currentTarget);
  // Runtime work is resolved by the action/decision continuation path; legal actions stay hidden while it is pending.
  if (
    detectPendingRuntimeWork(state) !== undefined ||
    state.replacementState.length > 0 ||
    !isSupportedBattleResolutionEnvelope(battle) ||
    target === null ||
    target.playerId !== defenderId ||
    !isSupportedCounterStepTarget(battle, target)
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
  if (getSupportedBattleCombatViewOrNull(state, battle) === null) {
    return [];
  }
  return defender.hand.flatMap((card) => {
    const metadata = state.cardManifest.cards[card.cardId];
    const eventActivation =
      metadata?.category === "event"
        ? getSupportedCounterEventActivation(state, card, defenderId)
        : null;
    if (
      !(
        (metadata?.category === "character" &&
          (getEffectiveCharacterCounterValue(state, card) ?? 0) > 0) ||
        (eventActivation !== null &&
          getActiveDonCount(defender.costArea) >= eventActivation.printedCost)
      )
    ) {
      return [];
    }
    if (metadata?.category === "event" && eventActivation !== null) {
      return [
        {
          type: "useCounter" as const,
          cardInstanceId: card.instanceId,
          target: battle.currentTarget,
        },
      ];
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
  options: EngineResultOptions = {},
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
  const combat = getSupportedBattleCombatView(state, battle);
  if ("reason" in combat) {
    return illegalAction(state, combat.reason);
  }
  if (!isSupportedCounterStepTarget(battle, target)) {
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
  const usesBattleCounterPower = true;
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
  } else if (metadata?.category === "event") {
    if (!sameCardRef(action.target, battle.currentTarget)) {
      return illegalAction(
        state,
        "Counter Event target must be current battle target.",
      );
    }
    const activation = getSupportedCounterEventActivation(
      state,
      handCard,
      decision.playerId,
    );
    if (activation === null) {
      return illegalAction(
        state,
        "Counter Events are unsupported in the Counter Step.",
      );
    }
    if (getActiveDonCount(defender.costArea) < activation.printedCost) {
      return illegalAction(
        state,
        "Counter Event requires enough active DON!!.",
      );
    }
    if (activation.printedCost > 0) {
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
          cost: { type: "restDon", count: activation.printedCost },
          paymentOptions: [
            { id: "restDon", type: "restDon", count: activation.printedCost },
          ],
        },
        eventJournal: [...state.eventJournal, ...events],
      };
      assertGameStateInvariantsIfEnabled(nextState, options);
      return toEngineResult(nextState, events, undefined, options);
    }
    return resolveCounterEventActivation({
      state,
      decisionPlayerId: decision.playerId,
      battle,
      handCard,
      activation,
      costArea: defender.costArea,
      priorEvents: [],
      options,
      ...(state.pendingDecision === undefined
        ? {}
        : { pendingDecision: state.pendingDecision }),
    });
  } else {
    return illegalAction(
      state,
      "Counter card must be a Character with counter.",
    );
  }

  const counterResult = resolveCounterCardUse({
    state,
    decisionPlayerId: decision.playerId,
    battle,
    handCard,
    target: action.target,
    counterValue,
    usesBattleCounterPower,
    costArea: defender.costArea,
    decisionResolvedId: undefined,
    applyCounterPower: true,
    pendingDecision: state.pendingDecision,
    priorEvents: [],
    options,
  });
  return counterResult;
};

export const resolveCounterEventActivation = (params: {
  readonly state: GameState;
  readonly decisionPlayerId: PlayerId;
  readonly battle: NonNullable<GameState["battle"]>;
  readonly handCard: CardInstance;
  readonly activation: SupportedCounterEventActivation;
  readonly costArea: GameState["players"][PlayerId]["costArea"];
  readonly decisionResolvedId?: NonNullable<GameState["pendingDecision"]>["id"];
  readonly pendingDecision?: NonNullable<GameState["pendingDecision"]>;
  readonly priorEvents: readonly EngineEvent[];
  readonly options?: EngineResultOptions;
}): EngineResult => {
  const {
    state,
    decisionPlayerId,
    battle,
    handCard,
    activation,
    costArea,
    decisionResolvedId,
    pendingDecision,
    priorEvents,
    options,
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
  const targetPower = getSupportedBattleCombatViewOrNull(state, battle)
    ?.targetView.currentPower;
  appendEvent(state, events, "counterUsed", {
    playerId: decisionPlayerId,
    instanceId: handCard.instanceId,
    cardId: handCard.cardId,
    target: battle.currentTarget,
    value: 0,
    ...(targetPower === undefined ? {} : { targetPower }),
  });
  const counterUsed = events.at(-1);
  if (counterUsed !== undefined && counterUsed.type === "counterUsed") {
    appendCombatSpotlightEntryCreatedEvent({
      state,
      events,
      anchorEvent: counterUsed,
      combat: {
        eventKind: "counterUsed",
        source: {
          instanceId: handCard.instanceId,
          cardId: handCard.cardId,
          playerId: decisionPlayerId,
          zone: handCard.zone,
        },
        target: battle.currentTarget,
        counterPower: 0,
      },
    });
  }

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

  let nextState: GameState = {
    ...movedResult.state,
    actionSeq: state.actionSeq + 1,
    players: {
      ...movedResult.state.players,
      [decisionPlayerId]: {
        ...movedDefender,
        costArea,
      },
    },
    battle,
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;

  const queued = queueCounterEventEffects({
    state: nextState,
    controllerId: decisionPlayerId,
    source: trashedCard,
    activation,
  });
  nextState = queued.state;
  if (queued.events.length === 0 && pendingDecision !== undefined) {
    nextState = {
      ...nextState,
      pendingDecision,
    };
  }

  assertGameStateInvariantsIfEnabled(nextState, options);
  return toEngineResult(
    nextState,
    [...priorEvents, ...events, ...queued.events],
    undefined,
    options,
  );
};

export const resolveCounterCardUse = (params: {
  state: GameState;
  decisionPlayerId: PlayerId;
  battle: NonNullable<GameState["battle"]>;
  handCard: CardInstance;
  target: CardRef;
  counterValue: number;
  usesBattleCounterPower: boolean;
  costArea: GameState["players"][PlayerId]["costArea"];
  decisionResolvedId: string | undefined;
  applyCounterPower?: boolean;
  pendingDecision: GameState["pendingDecision"] | undefined;
  priorEvents: readonly EngineEvent[];
  options?: EngineResultOptions;
}): EngineResult => {
  const {
    state,
    decisionPlayerId,
    battle,
    handCard,
    target,
    counterValue,
    usesBattleCounterPower,
    costArea,
    decisionResolvedId,
    applyCounterPower = true,
    pendingDecision,
    priorEvents,
    options,
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
  const targetPower = getSupportedBattleCombatViewOrNull(state, battle)
    ?.targetView.currentPower;
  appendEvent(state, events, "counterUsed", {
    playerId: decisionPlayerId,
    instanceId: handCard.instanceId,
    cardId: handCard.cardId,
    target,
    value: counterValue,
    ...(targetPower === undefined ? {} : { targetPower }),
  });
  const counterUsed = events.at(-1);
  if (counterUsed !== undefined && counterUsed.type === "counterUsed") {
    appendCombatSpotlightEntryCreatedEvent({
      state,
      events,
      anchorEvent: counterUsed,
      combat: {
        eventKind: "counterUsed",
        source: {
          instanceId: handCard.instanceId,
          cardId: handCard.cardId,
          playerId: decisionPlayerId,
          zone: handCard.zone,
        },
        target: battle.currentTarget,
        counterPower: counterValue,
      },
    });
  }
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
    continuousEffects: state.continuousEffects,
    eventJournal: [...state.eventJournal, ...events],
  };
  const resumePendingDecision = isCounterEvent ? undefined : pendingDecision;
  if (resumePendingDecision !== undefined) {
    nextState.pendingDecision = resumePendingDecision;
  } else {
    delete nextState.pendingDecision;
  }
  assertGameStateInvariantsIfEnabled(nextState, options);
  return toEngineResult(
    nextState,
    [...priorEvents, ...events],
    undefined,
    options,
  );
};
