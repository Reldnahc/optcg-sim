import type {
  Action,
  CardInstance,
  CardRef,
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
  illegalAction,
  toDecisionId,
  toEngineResult,
} from "../action-results.js";
import { reifyCardRef, toCardRef } from "../action-state.js";
import { hasUnsupportedBattleEffectMetadata, sameCardRef } from "./support.js";
import { hasUnsupportedCounterWindow } from "./counter-actions.js";
import { computeView } from "../compute-view.js";
import { detectPendingRuntimeWork } from "../effect-runtime.js";
import { hasOnlyFieldRemovalProtections } from "../field-removal-protection.js";
import {
  getSupportedLifeTriggerDecision,
  hasLifeTriggerText,
} from "../life-trigger-actions.js";

type BattleResolver = (state: GameState) => EngineResult;

const getBlockStepDecisionId = (
  state: GameState,
  attacker: CardInstance,
): DecisionId =>
  toDecisionId(
    `decision:blockStep:decline:${String(attacker.instanceId)}:${String(state.seq + 1)}`,
  );

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
        computed?.canBlock === true
      );
    })
    .map((character) => toPublicCardSelectionCandidate(character, defenderId));
};

export const createBlockStepDeclineDecision = (
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

export const getBlockStepDecisionLegalActions = (
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
    battle.step !== "block" ||
    decision.request.min !== 0 ||
    decision.request.max !== 1 ||
    decision.defaultResponse?.type !== "cards" ||
    decision.defaultResponse.cards.length !== 0
  ) {
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

const hasUnsupportedBlockDecisionState = (
  state: GameState,
  battle: NonNullable<GameState["battle"]>,
  defenderId: PlayerId,
): boolean => {
  if (
    detectPendingRuntimeWork(state) !== undefined ||
    state.replacementState.length > 0 ||
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
    (targetView.protectedFrom.length > 0 &&
      !hasOnlyFieldRemovalProtections(targetView.protectedFrom))
  ) {
    return true;
  }
  const attackerHasBanish = attackerView.keywords.includes("banish");
  if (target.isLeader && !attackerHasBanish) {
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
      return true;
    }
  }
  return false;
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
    blocker.card.state !== "active"
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

export const applyBlockStepDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  resolveSupportedVanillaBattle: BattleResolver,
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
      eventState,
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
      actionSeq: eventState.actionSeq,
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
    actionSeq: eventState.actionSeq,
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
