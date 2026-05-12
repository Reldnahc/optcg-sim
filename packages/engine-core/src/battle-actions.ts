import type {
  Action,
  CardInstance,
  EngineError,
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
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import {
  getCombatCardByInstanceId,
  isMatchActive,
  reifyCardRef,
  toCardRef,
} from "./action-state.js";
import { withAllAttackTimingCombatMetadataHidden } from "./attack-timing.js";
import { resolveSupportedVanillaBattle } from "./battle-resolution.js";
import { expireBattleDurationStateForCleanup } from "./battle-support.js";
import {
  applyBlockStepDecisionResponse,
  createBlockStepDeclineDecision,
  getBlockStepDecisionLegalActions,
} from "./battle-block-actions.js";
import {
  applyCounterStepDecisionResponse,
  applyUseCounter,
  getCounterStepDecisionLegalActions,
} from "./battle-counter-actions.js";
import { computeView } from "./compute-view.js";
import {
  detectPendingRuntimeWork,
  processEffectRuntime,
} from "./effect-runtime.js";
import { assertGameStateInvariants } from "./invariants.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";

export { applyUseCounter };
export { expireBattleDurationStateForCleanup, resolveSupportedVanillaBattle };

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
    const legalActionState = withAllAttackTimingCombatMetadataHidden(state);
    const view = computeView(legalActionState);
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

  const combatMetadataState = withAllAttackTimingCombatMetadataHidden(state);
  let legalTargets: readonly CardInstance["instanceId"][];
  let attackerHasDoubleAttack = false;
  try {
    const computed = computeView(combatMetadataState);
    attackerHasDoubleAttack =
      computed.cards[attacker.card.instanceId]?.keywords.includes(
        "doubleAttack",
      ) ?? false;
    legalTargets = computed.legalAttackTargets[attacker.card.instanceId] ?? [];
  } catch {
    const attackerMetadata = state.cardManifest.cards[attacker.card.cardId];
    const attackerKeywords = attackerMetadata?.printedKeywords ?? [];
    const supportedDoubleAttackFallback =
      attackerMetadata?.support.status === "implemented-dsl" &&
      attackerMetadata.support.effectDefinitionId === undefined &&
      (attackerMetadata.effectText ?? "").trim().length === 0 &&
      (attackerMetadata.triggerText ?? "").trim().length === 0 &&
      attackerKeywords.includes("doubleAttack") &&
      !attackerKeywords.includes("banish");
    if (!supportedDoubleAttackFallback) {
      return illegalAction(
        state,
        "declareAttack is unsupported for current combat metadata.",
      );
    }

    const fallbackManifest = {
      ...combatMetadataState.cardManifest,
      cards: {
        ...combatMetadataState.cardManifest.cards,
        [attacker.card.cardId]: {
          ...attackerMetadata,
          printedKeywords: attackerKeywords.filter(
            (keyword) => keyword !== "doubleAttack",
          ),
        },
      },
    };
    try {
      const computed = computeView({
        ...combatMetadataState,
        cardManifest: fallbackManifest,
      });
      legalTargets =
        computed.legalAttackTargets[attacker.card.instanceId] ?? [];
      attackerHasDoubleAttack = true;
    } catch {
      return illegalAction(
        state,
        "declareAttack is unsupported for current combat metadata.",
      );
    }
  }
  if (!legalTargets.includes(target.card.instanceId)) {
    return illegalAction(
      state,
      "declareAttack target is not legal for attacker.",
    );
  }
  if (detectPendingRuntimeWork(state) !== undefined) {
    return illegalAction(
      state,
      "declareAttack requires no pending runtime work.",
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
      damageCount: target.isLeader && attackerHasDoubleAttack ? 2 : 1,
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
  const attackTimingResult = resolveAttackTimingEffects(
    state,
    declaredResult.state,
    events,
  );
  if (attackTimingResult.errors !== undefined) {
    return attackTimingResult;
  }
  if (attackTimingResult.state.status.type !== "active") {
    return attackTimingResult;
  }
  if (!battleParticipantsRemainLegal(attackTimingResult.state)) {
    return cleanupBattleAfterAttackTiming(state, attackTimingResult);
  }

  const blockDecision = createBlockStepDeclineDecision(
    withAllAttackTimingCombatMetadataHidden(attackTimingResult.state),
  );
  if (blockDecision !== null) {
    const blockEvents = [...attackTimingResult.events];
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
      ...attackTimingResult.state,
      battle: {
        ...mustBattle(attackTimingResult.state),
        step: "block",
      },
      pendingDecision: blockDecision,
      eventJournal: [...state.eventJournal, ...blockEvents],
    };
    return toEngineResult(blockState, blockEvents);
  }

  const resolved = resolveSupportedVanillaBattle(attackTimingResult.state);
  if (resolved.errors !== undefined) {
    const firstError = resolved.errors[0];
    return firstError === undefined
      ? illegalAction(state, "Battle resolution failed.")
      : toEngineResult(state, [], [firstError]);
  }
  const resolutionEvents = rebaseEvents(
    state,
    resolved.events,
    attackTimingResult.events.length + 1,
  );
  const finalState: GameState = {
    ...resolved.state,
    cardManifest: state.cardManifest,
    seq: nextState.seq,
    actionSeq: nextState.actionSeq,
    eventJournal: [
      ...state.eventJournal,
      ...attackTimingResult.events,
      ...resolutionEvents,
    ],
  };
  return toEngineResult(finalState, [
    ...attackTimingResult.events,
    ...resolutionEvents,
  ]);
};

const toErrorTuple = (
  errors: readonly EngineError[],
): readonly [EngineError, ...EngineError[]] => {
  const first = errors[0];
  if (first === undefined) {
    return [
      {
        type: "effectRuntimeError",
        effectId: "attack-timing-effect-runtime",
        details: { reason: "empty-runtime-error-list" },
      },
    ];
  }
  return [first, ...errors.slice(1)];
};

const resolveAttackTimingEffects = (
  originalState: GameState,
  declaredState: GameState,
  declaredEvents: EngineEvent[],
): EngineResult => {
  const queued = processEffectRuntime(declaredState);
  if (queued.errors !== undefined) {
    return toEngineResult(originalState, [], toErrorTuple(queued.errors));
  }

  const resolved = processEffectRuntime(queued.state);
  if (resolved.errors !== undefined) {
    return toEngineResult(originalState, [], toErrorTuple(resolved.errors));
  }

  const runtimeEvents = rebaseEvents(
    originalState,
    [...queued.events, ...resolved.events],
    declaredEvents.length + 1,
  );
  const events = [...declaredEvents, ...runtimeEvents];
  const stateWithJournal: GameState = {
    ...resolved.state,
    seq: declaredState.seq,
    cardManifest: originalState.cardManifest,
    eventJournal: [...originalState.eventJournal, ...events],
  };
  assertGameStateInvariants(stateWithJournal);
  return toEngineResult(stateWithJournal, events);
};

const battleParticipantsRemainLegal = (state: GameState): boolean => {
  const battle = state.battle;
  if (battle === undefined) {
    return true;
  }
  return (
    reifyCardRef(state, battle.attacker) !== null &&
    reifyCardRef(state, battle.currentTarget) !== null
  );
};

const cleanupBattleAfterAttackTiming = (
  originalState: GameState,
  attackTimingResult: EngineResult,
): EngineResult => {
  const events = [...attackTimingResult.events];
  appendEvent(
    originalState,
    events,
    "effectResolved",
    { systemStep: "endBattle", battleCleared: true },
    { type: "replayOnly" },
  );
  const cleanedState = expireBattleDurationStateForCleanup(
    attackTimingResult.state,
  );
  const finalizedState = applyRuleProcessingCheckpoint({
    state: cleanedState,
    events,
    phase: "main",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(originalState, seqOffset, type, payload, visibility),
  });
  const stateWithJournal: GameState = {
    ...finalizedState,
    cardManifest: originalState.cardManifest,
    eventJournal: [...originalState.eventJournal, ...events],
  };
  assertGameStateInvariants(stateWithJournal);
  return toEngineResult(stateWithJournal, events);
};

const withOriginalManifestResult = (
  result: EngineResult,
  originalState: GameState,
): EngineResult => {
  const stateWithManifest: GameState = {
    ...result.state,
    cardManifest: originalState.cardManifest,
  };
  return result.errors === undefined
    ? toEngineResult(stateWithManifest, result.events)
    : toEngineResult(
        stateWithManifest,
        result.events,
        toErrorTuple(result.errors),
      );
};

const hideCurrentAttackTimingCombatMetadata = (state: GameState): GameState =>
  withAllAttackTimingCombatMetadataHidden(state);

const resolveSupportedBattleWithAttackTimingMetadata = (
  state: GameState,
): EngineResult =>
  withOriginalManifestResult(resolveSupportedVanillaBattle(state), state);

const mustBattle = (state: GameState): NonNullable<GameState["battle"]> => {
  const battle = state.battle;
  if (battle === undefined) {
    throw new Error("battle is required");
  }
  return battle;
};

export const getBattleDecisionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const actionState = hideCurrentAttackTimingCombatMetadata(state);
  return [
    ...getCounterStepDecisionLegalActions(actionState, playerId),
    ...getBlockStepDecisionLegalActions(actionState, playerId),
  ];
};

export const applyBattleDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const actionState = hideCurrentAttackTimingCombatMetadata(state);
  const resolveWithOriginalManifest = (
    resolverState: GameState,
  ): EngineResult =>
    resolveSupportedBattleWithAttackTimingMetadata({
      ...resolverState,
      cardManifest: state.cardManifest,
    });
  const counterResponse = applyCounterStepDecisionResponse(
    actionState,
    action,
    resolveWithOriginalManifest,
  );
  if (counterResponse !== null) {
    return withOriginalManifestResult(counterResponse, state);
  }
  const blockResponse = applyBlockStepDecisionResponse(
    actionState,
    action,
    resolveWithOriginalManifest,
  );
  return blockResponse === null
    ? null
    : withOriginalManifestResult(blockResponse, state);
};
