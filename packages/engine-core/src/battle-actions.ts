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
  reindexZoneCards,
  toCardRef,
} from "./action-state.js";
import { computeView } from "./compute-view.js";
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

const unsupportedBattleResolution = (
  state: GameState,
  reason: string,
): EngineResult => illegalAction(state, reason);

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
      (metadata.counter !== undefined && metadata.counter > 0)
    );
  });
};

export const resolveSupportedVanillaBattle = (
  state: GameState,
): EngineResult => {
  if (state.battle === undefined) {
    return illegalAction(state, "No active battle to resolve.");
  }
  if (
    state.battle.blocker !== undefined ||
    state.battle.damageCount !== 1 ||
    state.battle.step !== "attack"
  ) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported blocker, step, or multi-damage behavior.",
    );
  }
  if (
    state.effectQueue.length > 0 ||
    state.deferredTriggers.length > 0 ||
    state.replacementState.length > 0
  ) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported trigger or replacement processing.",
    );
  }

  const attacker = reifyCardRef(state, state.battle.attacker);
  const target = reifyCardRef(state, state.battle.currentTarget);
  if (attacker === null || target === null) {
    return illegalAction(state, "Battle participants are stale or invalid.");
  }
  if (hasUnsupportedCounterWindow(state, target.playerId)) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported counter window handling.",
    );
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
  if (
    attackerView.keywords.includes("banish") ||
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
          zone: "hand",
          playerId: target.playerId,
          slot: "hand",
          index: 0,
        },
      };
      const nextHand = reindexZoneCards(
        [movedLifeCard, ...damaged.hand],
        "hand",
        target.playerId,
        "hand",
      );
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
          [target.playerId]: { ...damaged, hand: nextHand, life: nextLife },
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
            zone: "hand",
            playerId: target.playerId,
            slot: "hand",
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
