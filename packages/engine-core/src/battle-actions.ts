import type {
  Action,
  CardRef,
  CardInstance,
  CardSelectionCandidate,
  DecisionId,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import {
  appendEvent,
  createEvent,
  illegalAction,
  rebaseEvents,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import {
  getCombatCardByInstanceId,
  isMatchActive,
  reifyCardRef,
  reindexZoneCards,
  toCardRef,
} from "./action-state.js";
import { computeView } from "./compute-view.js";
import { detectPendingRuntimeWork } from "./effect-runtime.js";
import { assertGameStateInvariants } from "./invariants.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";

export const getDeclareAttackLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  if (
    !isMatchActive(state) ||
    state.players[playerId] === undefined ||
    state.pendingDecision !== undefined ||
    state.turn.phase !== "main" ||
    state.turn.turnPlayerId !== playerId ||
    state.battle !== undefined
  ) {
    return [];
  }
  const actions: LegalAction[] = [];
  try {
    const view = computeView(state);
    for (const [attackerId, targetIds] of Object.entries(
      view.legalAttackTargets,
    )) {
      const attacker = getCombatCardByInstanceId(
        state,
        attackerId as CardInstance["instanceId"],
      );
      if (attacker === null || attacker.playerId !== playerId) {
        continue;
      }
      for (const targetId of targetIds) {
        const target = getCombatCardByInstanceId(state, targetId);
        if (target === null) {
          continue;
        }
        actions.push({
          type: "declareAttack",
          attacker: toCardRef(attacker.card, attacker.playerId),
          target: toCardRef(target.card, target.playerId),
        });
      }
    }
  } catch {
    // Fail closed when computed combat metadata is unsupported or invalid.
  }
  return actions;
};

export const applyDeclareAttack = (
  state: GameState,
  action: Extract<Action, { type: "declareAttack" }>,
): EngineResult => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "declareAttack is only legal while match is active.",
    );
  }
  if (state.turn.phase !== "main") {
    return illegalAction(state, "declareAttack requires main phase.");
  }
  if (state.battle !== undefined) {
    return illegalAction(
      state,
      "declareAttack is illegal during an active battle.",
    );
  }

  const attacker = reifyCardRef(state, action.attacker);
  if (attacker === null) {
    return illegalAction(
      state,
      "declareAttack attacker reference is stale or invalid.",
    );
  }
  if (attacker.playerId !== state.turn.turnPlayerId) {
    return illegalAction(
      state,
      "declareAttack attacker must be controlled by turn player.",
    );
  }
  if (attacker.card.state !== "active") {
    return illegalAction(state, "declareAttack attacker must be active.");
  }

  const target = reifyCardRef(state, action.target);
  if (target === null) {
    return illegalAction(
      state,
      "declareAttack target reference is stale or invalid.",
    );
  }

  let legalTargets: readonly CardInstance["instanceId"][];
  try {
    const computed = computeView(state);
    legalTargets = computed.legalAttackTargets[attacker.card.instanceId] ?? [];
  } catch {
    return illegalAction(
      state,
      "declareAttack is unsupported for current combat metadata.",
    );
  }
  if (!legalTargets.includes(target.card.instanceId)) {
    return illegalAction(
      state,
      "declareAttack target is not legal for attacker.",
    );
  }
  const nextPlayer = state.players[attacker.playerId];
  if (nextPlayer === undefined) {
    return illegalAction(
      state,
      "declareAttack attacker player does not exist.",
    );
  }
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [attacker.playerId]: {
        ...nextPlayer,
        leader: attacker.isLeader
          ? { ...nextPlayer.leader, state: "rested" }
          : nextPlayer.leader,
        characters: nextPlayer.characters.map((character) =>
          !attacker.isLeader &&
          character.instanceId === attacker.card.instanceId
            ? { ...character, state: "rested" }
            : character,
        ),
      },
    },
    battle: {
      attacker: toCardRef(attacker.card, attacker.playerId),
      originalTarget: toCardRef(target.card, target.playerId),
      currentTarget: toCardRef(target.card, target.playerId),
      step: "attack",
      damageCount: 1,
    },
  };

  const events: EngineEvent[] = [
    createEvent(
      state,
      1,
      "attackDeclared",
      {
        attacker: toCardRef(attacker.card, attacker.playerId),
        target: toCardRef(target.card, target.playerId),
      },
      { type: "public" },
    ),
  ];
  const declaredState = applyRuleProcessingCheckpoint({
    state: nextState,
    events,
    phase: "main",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  declaredState.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(declaredState);
  const declaredResult = toEngineResult(declaredState, events);
  if (declaredResult.errors !== undefined) {
    return declaredResult;
  }
  if (declaredResult.state.status.type !== "active") {
    return declaredResult;
  }
  const blockDecision = createBlockStepDeclineDecision(declaredResult.state);
  if (blockDecision !== null) {
    const blockEvents = [...events];
    appendEvent(
      state,
      blockEvents,
      "decisionCreated",
      {
        decisionId: blockDecision.id,
        decisionType: blockDecision.type,
        playerId: blockDecision.playerId,
      },
      { type: "public" },
    );
    const blockState: GameState = {
      ...declaredResult.state,
      battle: {
        ...mustBattle(declaredResult.state),
        step: "block",
      },
      pendingDecision: blockDecision,
      eventJournal: [...state.eventJournal, ...blockEvents],
    };
    return toEngineResult(blockState, blockEvents);
  }

  const resolved = resolveSupportedVanillaBattle(declaredResult.state);
  if (resolved.errors !== undefined) {
    const firstError = resolved.errors[0];
    return firstError === undefined
      ? illegalAction(state, "Battle resolution failed.")
      : toEngineResult(state, [], [firstError]);
  }
  const resolutionEvents = rebaseEvents(
    state,
    resolved.events,
    events.length + 1,
  );
  const finalState: GameState = {
    ...resolved.state,
    seq: nextState.seq,
    actionSeq: nextState.actionSeq,
    eventJournal: [...state.eventJournal, ...events, ...resolutionEvents],
  };
  return toEngineResult(finalState, [...events, ...resolutionEvents]);
};

const mustBattle = (state: GameState): NonNullable<GameState["battle"]> => {
  const battle = state.battle;
  if (battle === undefined) {
    throw new Error("battle is required");
  }
  return battle;
};

const getBlockStepDecisionId = (
  state: GameState,
  attacker: CardInstance,
): DecisionId =>
  toDecisionId(
    `decision:blockStep:decline:${String(attacker.instanceId)}:${String(state.seq + 1)}`,
  );

const getCounterStepDecisionId = (
  state: GameState,
  attacker: CardInstance,
): DecisionId =>
  toDecisionId(
    `decision:counterStep:pass:${String(attacker.instanceId)}:${String(state.seq + 1)}`,
  );

const isPrintedBlocker = (state: GameState, card: CardInstance): boolean => {
  const metadata = state.cardManifest.cards[card.cardId];
  if (metadata?.category !== "character") {
    return false;
  }
  return metadata.printedKeywords.includes("blocker");
};

const toPublicCardSelectionCandidate = (
  card: CardInstance,
  playerId: PlayerId,
): CardSelectionCandidate => ({
  card: toCardRef(card, playerId),
  visibility: { type: "public" },
});

const getLegalBlockerCandidates = (
  state: GameState,
  defenderId: PlayerId,
): CardSelectionCandidate[] => {
  const defender = state.players[defenderId];
  if (defender === undefined) {
    return [];
  }
  const view = computeView(state);
  return defender.characters
    .filter((character) => {
      const computed = view.cards[character.instanceId];
      return (
        character.controller === defenderId &&
        character.state === "active" &&
        isPrintedBlocker(state, character) &&
        computed?.canBlock === true
      );
    })
    .map((character) => toPublicCardSelectionCandidate(character, defenderId));
};

const createBlockStepDeclineDecision = (
  state: GameState,
): NonNullable<GameState["pendingDecision"]> | null => {
  const battle = state.battle;
  if (battle === undefined || battle.step !== "attack") {
    return null;
  }
  const target = reifyCardRef(state, battle.currentTarget);
  if (target === null) {
    return null;
  }
  if (hasUnsupportedBlockDecisionState(state, battle, target.playerId)) {
    return null;
  }
  const attacker = reifyCardRef(state, battle.attacker);
  if (attacker === null) {
    return null;
  }
  const blockStepState: GameState = {
    ...state,
    battle: { ...battle, step: "block" },
  };
  const candidates = getLegalBlockerCandidates(blockStepState, target.playerId);
  if (candidates.length === 0) {
    return null;
  }
  return {
    id: getBlockStepDecisionId(state, attacker.card),
    type: "selectCards",
    playerId: target.playerId,
    prompt: "Choose blocker or decline.",
    causedBy: {
      type: "playerAction",
      actionId: `action:${String(state.actionSeq)}`,
    },
    visibility: { type: "public" },
    request: {
      timing: "onActivation",
      chooser: "nonTurnPlayer",
      player: "nonTurnPlayer",
      zone: "characterArea",
      filter: { categories: ["character"] },
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "public",
    },
    candidates,
    defaultResponse: { type: "cards", cards: [] },
  };
};

const createCounterStepPassDecision = (
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

export const getBattleDecisionLegalActions = (
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
    decision.request.min !== 0 ||
    decision.defaultResponse?.type !== "cards" ||
    decision.defaultResponse.cards.length !== 0
  ) {
    return [];
  }
  if (battle.step === "counter") {
    if (
      decision.request.max !== 0 ||
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
  }
  if (battle.step !== "block" || decision.request.max !== 1) {
    return [];
  }
  if (hasUnsupportedBlockDecisionState(state, battle, decision.playerId)) {
    return [];
  }
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
  const target = reifyCardRef(state, battle.currentTarget);
  if (target === null || target.playerId !== defenderId) {
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

const hasUnsupportedBlockDecisionState = (
  state: GameState,
  battle: NonNullable<GameState["battle"]>,
  defenderId: PlayerId,
): boolean => {
  if (
    detectPendingRuntimeWork(state) !== undefined ||
    state.replacementState.length > 0 ||
    state.continuousEffects.length > 0 ||
    battle.blocker !== undefined ||
    battle.damageCount !== 1 ||
    (battle.step !== "attack" && battle.step !== "block")
  ) {
    return true;
  }
  if (hasUnsupportedCounterWindow(state, defenderId)) {
    return true;
  }
  let view: ReturnType<typeof computeView>;
  try {
    view = computeView(state);
  } catch {
    return true;
  }
  const attacker = reifyCardRef(state, battle.attacker);
  const target = reifyCardRef(state, battle.currentTarget);
  if (attacker === null || target === null) {
    return true;
  }
  if (hasUnsupportedBattleEffectMetadata(state)) {
    return true;
  }
  const attackerView = view.cards[attacker.card.instanceId];
  const targetView = view.cards[target.card.instanceId];
  if (
    attackerView?.currentPower === undefined ||
    targetView?.currentPower === undefined
  ) {
    return true;
  }
  if (Object.keys(view.restrictions).length > 0) {
    return true;
  }
  if (
    attackerView.keywords.includes("doubleAttack") ||
    targetView.protectedFrom.length > 0
  ) {
    return true;
  }
  const attackerHasBanish = attackerView.keywords.includes("banish");
  if (target.isLeader && !attackerHasBanish) {
    const targetPlayer = state.players[target.playerId];
    const topLife = targetPlayer?.life[0];
    const topLifeMeta =
      topLife === undefined
        ? undefined
        : state.cardManifest.cards[topLife.card.cardId];
    if (
      topLifeMeta?.triggerText !== undefined &&
      topLifeMeta.triggerText.length > 0
    ) {
      return true;
    }
  }
  return false;
};

const sameCardRef = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId;

const hasText = (value: string | undefined): boolean =>
  value !== undefined && value.trim().length > 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const hasThisBattleDuration = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  const duration = value["duration"];
  if (isRecord(duration) && duration["type"] === "thisBattle") {
    return true;
  }
  return Object.values(value).some((entry) => hasThisBattleDuration(entry));
};

const hasUnsupportedBattleEffectBody = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }

  const type = value["type"];
  if (
    type === "protectFromKO" ||
    type === "cannotBeBlockedBy" ||
    type === "cannotBeAttacked" ||
    type === "cannotBlock"
  ) {
    return true;
  }
  if (type === "giveKeyword" && value["keyword"] === "unblockable") {
    return true;
  }

  const operation = value["operation"];
  if (isRecord(operation)) {
    if (
      operation["type"] === "protection" ||
      operation["type"] === "restriction"
    ) {
      return true;
    }
    if (isRecord(operation["protection"])) {
      return true;
    }
  }
  if (isRecord(value["protection"])) {
    return true;
  }

  return Object.values(value).some((entry) =>
    hasUnsupportedBattleEffectBody(entry),
  );
};

const hasUnsupportedBattleEffectMetadata = (state: GameState): boolean => {
  const combatCardIds = new Set<CardInstance["cardId"]>();
  for (const player of Object.values(state.players)) {
    combatCardIds.add(player.leader.cardId);
    for (const character of player.characters) {
      combatCardIds.add(character.cardId);
    }
  }

  for (const cardId of combatCardIds) {
    if (hasText(state.cardManifest.cards[cardId]?.effectText)) {
      return true;
    }
  }

  for (const definition of Object.values(
    state.cardManifest.effectDefinitions ?? {},
  )) {
    if (!combatCardIds.has(definition.cardId)) {
      continue;
    }
    for (const effect of definition.effects) {
      if (
        effect.trigger.type === "counter" ||
        effect.trigger.type === "onBlock" ||
        effect.trigger.type === "onKO" ||
        effect.trigger.type === "endOfBattle" ||
        effect.trigger.type === "whenAttacking" ||
        effect.trigger.type === "onOpponentAttack" ||
        effect.category === "replacement" ||
        hasThisBattleDuration(effect.effect) ||
        hasUnsupportedBattleEffectBody(effect.effect)
      ) {
        return true;
      }
    }
  }

  return false;
};

const isSupportedBattleResolutionEnvelope = (
  battle: NonNullable<GameState["battle"]>,
): boolean => {
  if (battle.damageCount !== 1) {
    return false;
  }
  if (battle.blocker === undefined) {
    return battle.step === "attack" || battle.step === "counter";
  }
  return (
    (battle.step === "block" || battle.step === "counter") &&
    sameCardRef(battle.blocker, battle.currentTarget)
  );
};

const isLegalBlockerSelection = (
  state: GameState,
  defenderId: PlayerId,
  selected: CardRef,
): boolean => {
  const blocker = reifyCardRef(state, selected);
  if (blocker === null || blocker.isLeader) {
    return false;
  }
  if (
    blocker.playerId !== defenderId ||
    blocker.card.controller !== defenderId ||
    blocker.card.zone.zone !== "characterArea" ||
    blocker.card.state !== "active" ||
    !isPrintedBlocker(state, blocker.card)
  ) {
    return false;
  }
  const candidates = getLegalBlockerCandidates(state, defenderId);
  return candidates.some((candidate) => sameCardRef(candidate.card, selected));
};

const restBlocker = (
  state: GameState,
  defenderId: PlayerId,
  blocker: CardRef,
): GameState["players"] => {
  const defender = state.players[defenderId];
  if (defender === undefined) {
    return state.players;
  }
  return {
    ...state.players,
    [defenderId]: {
      ...defender,
      characters: defender.characters.map((character) =>
        character.instanceId === blocker.instanceId &&
        character.cardId === blocker.cardId
          ? { ...character, state: "rested" }
          : character,
      ),
    },
  };
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
  if (
    decision.playerId === state.turn.turnPlayerId ||
    hasUnsupportedCounterWindow(state, decision.playerId)
  ) {
    return illegalAction(
      state,
      "Battle requires unsupported counter window handling.",
    );
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

export const applyBattleDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  const battle = state.battle;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    battle === undefined
  ) {
    return null;
  }
  if (battle.step === "counter") {
    if (
      action.response.type !== "cards" ||
      action.response.cards.length !== 0
    ) {
      return illegalAction(state, "Counter Step decision supports pass only.");
    }
    if (
      decision.request.min !== 0 ||
      decision.request.max !== 0 ||
      decision.defaultResponse?.type !== "cards" ||
      decision.defaultResponse.cards.length !== 0 ||
      decision.candidates.length !== 0
    ) {
      return illegalAction(
        state,
        "Unsupported Counter Step decision envelope.",
      );
    }
    if (
      decision.playerId === state.turn.turnPlayerId ||
      hasUnsupportedCounterWindow(state, decision.playerId)
    ) {
      return illegalAction(
        state,
        "Battle requires unsupported counter window handling.",
      );
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
  }
  if (battle.step !== "block") {
    return null;
  }
  if (action.response.type !== "cards" || action.response.cards.length > 1) {
    return illegalAction(
      state,
      "Block Step decision supports selecting zero or one blocker.",
    );
  }
  if (
    decision.request.min !== 0 ||
    decision.request.max !== 1 ||
    decision.defaultResponse?.type !== "cards" ||
    decision.defaultResponse.cards.length !== 0
  ) {
    return illegalAction(state, "Unsupported Block Step decision envelope.");
  }
  const defender = state.players[decision.playerId];
  if (defender === undefined || decision.playerId === state.turn.turnPlayerId) {
    return illegalAction(state, "Decision player mismatch.");
  }
  if (hasUnsupportedBlockDecisionState(state, battle, decision.playerId)) {
    return illegalAction(
      state,
      "Battle requires unsupported blocker, counter, or replacement handling.",
    );
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    { decisionId: decision.id, playerId: decision.playerId },
    { type: "public" },
  );
  const selectedBlocker = action.response.cards[0];
  if (selectedBlocker !== undefined) {
    if (!isLegalBlockerSelection(state, decision.playerId, selectedBlocker)) {
      return illegalAction(state, "Selected blocker is not legal.");
    }
    const selected = reifyCardRef(state, selectedBlocker);
    if (selected === null || selected.isLeader) {
      return illegalAction(state, "Selected blocker is not legal.");
    }
    const blockerRef = toCardRef(selected.card, selected.playerId);
    const previousTarget = battle.currentTarget;
    appendEvent(
      state,
      events,
      "blockerActivated",
      {
        blocker: blockerRef,
        previousTarget,
        currentTarget: blockerRef,
      },
      { type: "public" },
    );
    const activatedState: GameState = {
      ...state,
      actionSeq: state.actionSeq + 1,
      players: restBlocker(state, decision.playerId, blockerRef),
      battle: {
        ...battle,
        blocker: blockerRef,
        currentTarget: blockerRef,
      },
      eventJournal: [...state.eventJournal, ...events],
    };
    delete activatedState.pendingDecision;
    const resolved = resolveSupportedVanillaBattle(activatedState);
    if (resolved.errors !== undefined) {
      const firstError = resolved.errors[0];
      return firstError === undefined
        ? illegalAction(state, "Battle resolution failed.")
        : toEngineResult(state, [], [firstError]);
    }
    return toEngineResult(resolved.state, [...events, ...resolved.events]);
  }

  const resumedState: GameState = {
    ...state,
    actionSeq: state.actionSeq + 1,
    battle: { ...battle, step: "attack" },
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

const hasRawCounterText = (value: string | undefined): boolean =>
  value !== undefined && /\bcounter\b/i.test(value);

const hasCounterTriggerDefinition = (
  state: GameState,
  cardId: CardInstance["cardId"],
): boolean =>
  Object.values(state.cardManifest.effectDefinitions ?? {}).some(
    (definition) =>
      definition.cardId === cardId &&
      definition.effects.some((effect) => effect.trigger.type === "counter"),
  );

const hasUnsupportedCounterWindow = (
  state: GameState,
  defenderId: PlayerId,
): boolean => {
  const defender = state.players[defenderId];
  if (defender === undefined) {
    return true;
  }
  return defender.hand.some((card) => {
    const metadata = state.cardManifest.cards[card.cardId];
    return (
      metadata === undefined ||
      hasCounterTriggerDefinition(state, card.cardId) ||
      (metadata.category === "event" &&
        ((metadata.counter !== undefined && metadata.counter > 0) ||
          hasRawCounterText(metadata.effectText) ||
          hasRawCounterText(metadata.triggerText)))
    );
  });
};

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

const enterCounterStepOrAutoPass = (state: GameState): EngineResult | null => {
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
  if (hasUnsupportedCounterWindow(counterState, target.playerId)) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported counter window handling.",
    );
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
  if (hasUnsupportedBattleEffectMetadata(state)) {
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
    view = computeView(state);
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
      topLife === undefined
        ? undefined
        : state.cardManifest.cards[topLife.card.cardId];
    if (
      topLifeMeta?.triggerText !== undefined &&
      topLifeMeta.triggerText.length > 0
    ) {
      return "Life trigger reveal decisions are unsupported in this battle path.";
    }
  }

  return undefined;
};

export const resolveSupportedVanillaBattle = (
  state: GameState,
): EngineResult => {
  if (state.battle === undefined) {
    return illegalAction(state, "No active battle to resolve.");
  }
  if (!isSupportedBattleResolutionEnvelope(state.battle)) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported blocker, step, or multi-damage behavior.",
    );
  }
  if (
    detectPendingRuntimeWork(state) !== undefined ||
    state.replacementState.length > 0 ||
    state.continuousEffects.length > 0
  ) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported trigger or replacement processing.",
    );
  }
  if (hasUnsupportedBattleEffectMetadata(state)) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported effect metadata.",
    );
  }

  const attacker = reifyCardRef(state, state.battle.attacker);
  const target = reifyCardRef(state, state.battle.currentTarget);
  if (attacker === null || target === null) {
    return illegalAction(state, "Battle participants are stale or invalid.");
  }
  if (state.battle.blocker !== undefined) {
    const blocker = reifyCardRef(state, state.battle.blocker);
    if (
      blocker === null ||
      blocker.isLeader ||
      !sameCardRef(state.battle.blocker, state.battle.currentTarget)
    ) {
      return illegalAction(state, "Battle blocker is stale or invalid.");
    }
  }
  if (state.battle.step !== "counter") {
    const counterStepResult = enterCounterStepOrAutoPass(state);
    if (counterStepResult !== null) {
      return counterStepResult;
    }
  }

  let view: ReturnType<typeof computeView>;
  try {
    view = computeView(state);
  } catch {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported combat metadata.",
    );
  }
  if (Object.keys(view.restrictions).length > 0) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported restriction handling.",
    );
  }

  const attackerView = view.cards[attacker.card.instanceId];
  const targetView = view.cards[target.card.instanceId];
  if (
    attackerView?.currentPower === undefined ||
    targetView?.currentPower === undefined
  ) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported derived power metadata.",
    );
  }
  const attackerHasBanish = attackerView.keywords.includes("banish");
  if (
    attackerView.keywords.includes("doubleAttack") ||
    targetView.protectedFrom.length > 0
  ) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported keyword or protection handling.",
    );
  }

  const events: EngineEvent[] = [];
  let nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
  };
  delete nextState.battle;

  if (attackerView.currentPower >= targetView.currentPower) {
    if (target.isLeader) {
      const damaged = nextState.players[target.playerId];
      const topLife = damaged?.life[0];
      if (damaged === undefined) {
        return illegalAction(state, "Battle target player does not exist.");
      }
      if (topLife === undefined) {
        appendEvent(state, events, "damageDealt", {
          attacker: attacker.card.instanceId,
          target: target.card.instanceId,
          amount: 1,
        });
        nextState = applyRuleProcessingCheckpoint({
          state: nextState,
          events,
          phase: "main",
          createEvent: (seqOffset, type, payload, visibility) =>
            createEvent(state, seqOffset, type, payload, visibility),
          immediateLosers: [target.playerId],
        });
        events.push(
          createEvent(
            state,
            events.length + 1,
            "effectResolved",
            { systemStep: "endBattle", battleCleared: true },
            { type: "replayOnly" },
          ),
        );
        nextState.eventJournal = [...state.eventJournal, ...events];
        assertGameStateInvariants(nextState);
        return toEngineResult(nextState, events);
      }
      const lifeMeta = nextState.cardManifest.cards[topLife.card.cardId];
      if (
        !attackerHasBanish &&
        lifeMeta?.triggerText !== undefined &&
        lifeMeta.triggerText.length > 0
      ) {
        return unsupportedBattleResolution(
          state,
          "Life trigger reveal decisions are unsupported in this battle path.",
        );
      }
      const movedLifeCard: CardInstance = {
        ...topLife.card,
        zone: {
          zone: attackerHasBanish ? "trash" : "hand",
          playerId: target.playerId,
          slot: attackerHasBanish ? "trash" : "hand",
          index: 0,
        },
      };
      const nextHand = attackerHasBanish
        ? damaged.hand
        : reindexZoneCards(
            [movedLifeCard, ...damaged.hand],
            "hand",
            target.playerId,
            "hand",
          );
      const nextTrash = attackerHasBanish
        ? reindexZoneCards(
            [movedLifeCard, ...damaged.trash],
            "trash",
            target.playerId,
            "trash",
          )
        : damaged.trash;
      const nextLife = damaged.life.slice(1).map((lifeCard, index) => ({
        ...lifeCard,
        card: {
          ...lifeCard.card,
          zone: {
            zone: "life",
            playerId: target.playerId,
            slot: "life",
            index,
          },
        },
      }));
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [target.playerId]: {
            ...damaged,
            hand: nextHand,
            life: nextLife,
            trash: nextTrash,
          },
        },
      };
      appendEvent(state, events, "damageDealt", {
        attacker: attacker.card.instanceId,
        target: target.card.instanceId,
        amount: 1,
      });
      appendEvent(state, events, "lifeTaken", {
        damagedPlayerId: target.playerId,
        amount: 1,
      });
      appendEvent(
        state,
        events,
        "cardMoved",
        {
          from: {
            zone: "life",
            playerId: target.playerId,
            slot: "life",
            index: 0,
          },
          to: {
            zone: attackerHasBanish ? "trash" : "hand",
            playerId: target.playerId,
            slot: attackerHasBanish ? "trash" : "hand",
            index: 0,
          },
          reason: "battleDamage",
        },
        { type: "public" },
      );
      appendEvent(
        state,
        events,
        "cardMoved",
        {
          instanceId: movedLifeCard.instanceId,
          cardId: movedLifeCard.cardId,
          from: {
            zone: "life",
            playerId: target.playerId,
            slot: "life",
            index: 0,
          },
          to: movedLifeCard.zone,
          reason: "battleDamage",
        },
        { type: "private", playerId: target.playerId },
      );
    } else {
      const defender = nextState.players[target.playerId];
      if (defender === undefined) {
        return illegalAction(state, "Battle target player does not exist.");
      }
      const koIndex = defender.characters.findIndex(
        (character) => character.instanceId === target.card.instanceId,
      );
      if (koIndex < 0 || target.card.state !== "rested") {
        return unsupportedBattleResolution(
          state,
          "Battle target is no longer a supported rested character target.",
        );
      }
      const koCard = defender.characters[koIndex];
      if (koCard === undefined) {
        return illegalAction(state, "K.O. target not found.");
      }
      const nextCharacters = reindexZoneCards(
        defender.characters.filter((_, index) => index !== koIndex),
        "characterArea",
        target.playerId,
        "character",
      );
      const trashedCard: CardInstance = {
        ...koCard,
        attachedDon: [],
        zone: {
          zone: "trash",
          playerId: target.playerId,
          slot: "trash",
          index: 0,
        },
      };
      const nextTrash = reindexZoneCards(
        [trashedCard, ...defender.trash],
        "trash",
        target.playerId,
        "trash",
      );
      const attachedDonIds = new Set(koCard.attachedDon);
      const nextCostArea = defender.costArea.map((card) =>
        attachedDonIds.has(card.instanceId)
          ? { ...card, state: "rested" }
          : card,
      );
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [target.playerId]: {
            ...defender,
            characters: nextCharacters,
            trash: nextTrash,
            costArea: nextCostArea,
          },
        },
      };
      appendEvent(state, events, "damageDealt", {
        attacker: attacker.card.instanceId,
        target: target.card.instanceId,
        amount: 1,
      });
      appendEvent(state, events, "cardKOd", {
        playerId: target.playerId,
        instanceId: target.card.instanceId,
      });
      appendEvent(state, events, "cardMoved", {
        from: target.card.zone,
        to: trashedCard.zone,
        reason: "ko",
      });
      for (const donId of koCard.attachedDon) {
        appendEvent(
          state,
          events,
          "donReturned",
          { playerId: target.playerId, donInstanceId: donId, state: "rested" },
          { type: "replayOnly" },
        );
      }
    }
  }

  events.push(
    createEvent(
      state,
      events.length + 1,
      "effectResolved",
      { systemStep: "endBattle", battleCleared: true },
      { type: "replayOnly" },
    ),
  );
  nextState = applyRuleProcessingCheckpoint({
    state: nextState,
    events,
    phase: "main",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  nextState.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};
