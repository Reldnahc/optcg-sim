import type {
  Action,
  CardInstance,
  DecisionId,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import {
  appendEvent,
  illegalAction,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { reifyCardRef, reindexZoneCards } from "./action-state.js";
import { withAllAttackTimingCombatMetadataHidden } from "./attack-timing.js";
import {
  hasUnsupportedBattleEffectMetadata,
  isSupportedBattleResolutionEnvelope,
  sameCardRef,
} from "./battle-support.js";
import { computeView } from "./compute-view.js";
import { detectPendingRuntimeWork } from "./effect-runtime.js";
import { assertGameStateInvariants } from "./invariants.js";
import {
  getSupportedLifeTriggerDecision,
  hasLifeTriggerText,
} from "./life-trigger-actions.js";

type BattleResolver = (state: GameState) => EngineResult;

const getCounterStepDecisionId = (
  state: GameState,
  attacker: CardInstance,
): DecisionId =>
  toDecisionId(
    `decision:counterStep:pass:${String(attacker.instanceId)}:${String(state.seq + 1)}`,
  );

export const createCounterStepPassDecision = (
  state: GameState,
): NonNullable<GameState["pendingDecision"]> | null => {
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
  if (!hasPotentialCharacterCounterActions(state, target.playerId)) {
    return null;
  }
  const attacker = reifyCardRef(state, battle.attacker);
  if (attacker === null) {
    return null;
  }
  return {
    id: getCounterStepDecisionId(state, attacker.card),
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
    state.continuousEffects.length > 0 ||
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
    targetView.protectedFrom.length > 0
  ) {
    return [];
  }
  return defender.hand.flatMap((card) => {
    const metadata = state.cardManifest.cards[card.cardId];
    if (
      metadata?.category !== "character" ||
      metadata.counter === undefined ||
      metadata.counter <= 0
    ) {
      return [];
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
  if (!sameCardRef(action.target, battle.currentTarget)) {
    return illegalAction(
      state,
      "Counter target must be current battle target.",
    );
  }
  const attacker = reifyCardRef(state, battle.attacker);
  const target = reifyCardRef(state, battle.currentTarget);
  if (attacker === null || target === null) {
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
    state.replacementState.length > 0 ||
    state.continuousEffects.length > 0
  ) {
    return illegalAction(
      state,
      "Battle requires unsupported trigger or replacement processing.",
    );
  }
  const combatMetadataState = withAllAttackTimingCombatMetadataHidden(state);
  if (hasUnsupportedBattleEffectMetadata(combatMetadataState)) {
    return illegalAction(state, "Battle requires unsupported effect metadata.");
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
  if (
    metadata?.category !== "character" ||
    metadata.counter === undefined ||
    metadata.counter <= 0
  ) {
    return illegalAction(
      state,
      "Counter card must be a Character with counter.",
    );
  }

  const counterValue = metadata.counter;
  const trashedCard: CardInstance = {
    ...handCard,
    attachedDon: [],
    zone: {
      zone: "trash",
      playerId: decision.playerId,
      slot: "trash",
      index: 0,
    },
  };
  const nextHand = reindexZoneCards(
    defender.hand.filter((_, index) => index !== handIndex),
    "hand",
    decision.playerId,
    "hand",
  );
  const nextTrash = reindexZoneCards(
    [trashedCard, ...defender.trash],
    "trash",
    decision.playerId,
    "trash",
  );
  const events: EngineEvent[] = [];
  appendEvent(state, events, "counterUsed", {
    playerId: decision.playerId,
    instanceId: handCard.instanceId,
    cardId: handCard.cardId,
    target: battle.currentTarget,
    value: counterValue,
  });
  appendEvent(state, events, "cardMoved", {
    instanceId: handCard.instanceId,
    cardId: handCard.cardId,
    from: handCard.zone,
    to: trashedCard.zone,
    reason: "counter",
  });
  appendEvent(state, events, "cardTrashed", {
    playerId: decision.playerId,
    instanceId: handCard.instanceId,
    cardId: handCard.cardId,
    reason: "counter",
  });

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [decision.playerId]: {
        ...defender,
        hand: nextHand,
        trash: nextTrash,
      },
    },
    battle: {
      ...battle,
      counterPower: (battle.counterPower ?? 0) + counterValue,
    },
    eventJournal: [...state.eventJournal, ...events],
  };
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

export const applyCounterStepDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  resolveSupportedVanillaBattle: BattleResolver,
): EngineResult | null => {
  const decision = state.pendingDecision;
  const battle = state.battle;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    battle === undefined ||
    battle.step !== "counter"
  ) {
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

const unsupportedBattleResolution = (
  state: GameState,
  reason: string,
): EngineResult => illegalAction(state, reason);

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
): boolean => {
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
  if (defender === undefined) {
    return "Battle requires unsupported counter window handling.";
  }
  for (const card of defender.hand) {
    const metadata = state.cardManifest.cards[card.cardId];
    if (metadata === undefined) {
      return "Battle requires unsupported counter window handling.";
    }
    if (isUnsupportedCounterEventCandidate(state, card)) {
      return unsupportedCounterEventReason;
    }
    if (hasCounterTriggerDefinition(state, card.cardId)) {
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
  const defender = state.players[defenderId];
  if (defender === undefined) {
    return false;
  }
  return defender.hand.some((card) => {
    const metadata = state.cardManifest.cards[card.cardId];
    return (
      metadata?.category === "character" &&
      metadata.counter !== undefined &&
      metadata.counter > 0
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
    return unsupportedBattleResolution(state, unsupportedCounterWindowReason);
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

const getUnsupportedDamageStepContinuationReason = (
  state: GameState,
): string | undefined => {
  const battle = state.battle;
  if (
    battle === undefined ||
    battle.step !== "counter" ||
    !isSupportedBattleResolutionEnvelope(battle)
  ) {
    return "Battle requires unsupported blocker, step, or multi-damage behavior.";
  }
  if (
    detectPendingRuntimeWork(state) !== undefined ||
    state.replacementState.length > 0 ||
    state.continuousEffects.length > 0
  ) {
    return "Battle requires unsupported trigger or replacement processing.";
  }
  const combatMetadataState = withAllAttackTimingCombatMetadataHidden(state);
  if (hasUnsupportedBattleEffectMetadata(combatMetadataState)) {
    return "Battle requires unsupported effect metadata.";
  }
  const attacker = reifyCardRef(state, battle.attacker);
  const target = reifyCardRef(state, battle.currentTarget);
  if (attacker === null || target === null) {
    return "Battle participants are stale or invalid.";
  }
  if (battle.blocker !== undefined) {
    const blocker = reifyCardRef(state, battle.blocker);
    if (
      blocker === null ||
      blocker.isLeader ||
      !sameCardRef(battle.blocker, battle.currentTarget)
    ) {
      return "Battle blocker is stale or invalid.";
    }
  }

  let view: ReturnType<typeof computeView>;
  try {
    view = computeView(combatMetadataState);
  } catch {
    return "Battle requires unsupported combat metadata.";
  }
  if (Object.keys(view.restrictions).length > 0) {
    return "Battle requires unsupported restriction handling.";
  }

  const attackerView = view.cards[attacker.card.instanceId];
  const targetView = view.cards[target.card.instanceId];
  if (
    attackerView?.currentPower === undefined ||
    targetView?.currentPower === undefined
  ) {
    return "Battle requires unsupported derived power metadata.";
  }
  if (
    attackerView.keywords.includes("doubleAttack") ||
    targetView.protectedFrom.length > 0
  ) {
    return "Battle requires unsupported keyword or protection handling.";
  }
  if (
    attackerView.currentPower >= targetView.currentPower &&
    !target.isLeader
  ) {
    const targetPlayer = state.players[target.playerId];
    const targetIndex = targetPlayer?.characters.findIndex(
      (character) => character.instanceId === target.card.instanceId,
    );
    if (
      targetPlayer === undefined ||
      targetIndex === undefined ||
      targetIndex < 0 ||
      target.card.state !== "rested"
    ) {
      return "Battle target is no longer a supported rested character target.";
    }
  }
  if (
    attackerView.currentPower >= targetView.currentPower &&
    target.isLeader &&
    !attackerView.keywords.includes("banish")
  ) {
    const targetPlayer = state.players[target.playerId];
    const topLife = targetPlayer?.life[0];
    const topLifeMeta =
      topLife && state.cardManifest.cards[topLife.card.cardId];
    if (
      topLife !== undefined &&
      hasLifeTriggerText(topLifeMeta?.triggerText) &&
      getSupportedLifeTriggerDecision(state, target.playerId, topLife.card) ===
        undefined
    ) {
      return "Life trigger reveal decisions are unsupported in this battle path.";
    }
  }

  return undefined;
};
