import type {
  Action,
  CardInstance,
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

export const getBattleDecisionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => [
  ...getCounterStepDecisionLegalActions(state, playerId),
  ...getBlockStepDecisionLegalActions(state, playerId),
];

export const applyBattleDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const counterResponse = applyCounterStepDecisionResponse(
    state,
    action,
    resolveSupportedVanillaBattle,
  );
  if (counterResponse !== null) {
    return counterResponse;
  }
  return applyBlockStepDecisionResponse(
    state,
    action,
    resolveSupportedVanillaBattle,
  );
};
