import type {
  Action,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import { illegalAction } from "./action-results.js";
import { isMatchActive } from "./action-state.js";
import {
  applyBattleDecisionResponse,
  applyDeclareAttack,
  getBattleDecisionLegalActions,
  getDeclareAttackLegalActions,
  resolveSupportedVanillaBattle,
} from "./battle-actions.js";
import { applyAttachDon, getAttachDonLegalActions } from "./don-actions.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./play-card.js";
import { detectPendingRuntimeWork } from "./effect-runtime.js";
import {
  applyConcede,
  applyEndMainPhase,
  getTurnLegalActions,
} from "./turn-actions.js";

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
    actions.push(...getPlayCardLegalActions(state, playerId));
    actions.push(...getBattleDecisionLegalActions(state, playerId));
    return actions;
  }

  actions.push(...getTurnLegalActions(state, playerId));
  actions.push(...getAttachDonLegalActions(state, playerId));
  actions.push(...getPlayCardLegalActions(state, playerId));
  actions.push(...getDeclareAttackLegalActions(state, playerId));
  return actions;
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

  const playCardResult = applyPlayCardDecisionResponse(state, action);
  if (playCardResult !== null) {
    return playCardResult;
  }
  const battleResult = applyBattleDecisionResponse(state, action);
  if (battleResult !== null) {
    return battleResult;
  }
  return illegalAction(state, "Unsupported decision type.");
};

export { resolveSupportedVanillaBattle };

export const applyAction = (state: GameState, action: Action): EngineResult => {
  if (action.type === "concede") {
    return applyConcede(state, action);
  }
  if (action.type === "respondToDecision") {
    return applyRespondToDecision(state, action);
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
  if (action.type === "playCard") {
    return applyPlayCard(state, action);
  }
  if (action.type === "endMainPhase") {
    return applyEndMainPhase(state);
  }
  if (action.type === "attachDon") {
    return applyAttachDon(state, action);
  }
  if (action.type === "declareAttack") {
    return applyDeclareAttack(state, action);
  }
  return illegalAction(state, `Unsupported action type: ${action.type}`);
};
