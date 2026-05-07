import type {
  CardInstance,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  appendEvent,
  createEvent,
  illegalAction,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { reifyCardRef, reindexZoneCards } from "./action-state.js";
import { withAllAttackTimingCombatMetadataHidden } from "./attack-timing.js";
import {
  expireBattleDurationStateForCleanup,
  hasUnsupportedBattleEffectMetadata,
  isSupportedBattleResolutionEnvelope,
  sameCardRef,
  withSupportedBattleRuntimeMetadataHidden,
} from "./battle-support.js";
import {
  createCounterStepPassDecision,
  getUnsupportedCounterWindowReason,
} from "./battle-counter-actions.js";
import { computeView } from "./compute-view.js";
import {
  detectBattleKOTriggerCandidates,
  detectPendingRuntimeWork,
  processDefenderOpponentAttackTiming,
} from "./effect-runtime.js";
import { assertGameStateInvariants } from "./invariants.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";

const unsupportedBattleResolution = (
  state: GameState,
  reason: string,
): EngineResult => illegalAction(state, reason);

const toErrorTuple = (
  errors: readonly EngineError[],
): readonly [EngineError, ...EngineError[]] => {
  const first = errors[0];
  if (first === undefined) {
    return [
      {
        type: "effectRuntimeError",
        effectId: "battle-resolution",
        details: { reason: "empty-runtime-error-list" },
      },
    ];
  }
  return [first, ...errors.slice(1)];
};

export const resolveSupportedVanillaBattle = (
  state: GameState,
): EngineResult => {
  let resolutionState = state;
  if (resolutionState.battle === undefined) {
    return illegalAction(state, "No active battle to resolve.");
  }
  if (!isSupportedBattleResolutionEnvelope(resolutionState.battle)) {
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
  if (
    hasUnsupportedBattleEffectMetadata(
      withSupportedBattleRuntimeMetadataHidden(
        withAllAttackTimingCombatMetadataHidden(state),
      ),
    )
  ) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported effect metadata.",
    );
  }

  const initialBattle = resolutionState.battle;
  const initialAttacker = reifyCardRef(resolutionState, initialBattle.attacker);
  const initialTarget = reifyCardRef(
    resolutionState,
    initialBattle.currentTarget,
  );
  if (initialAttacker === null || initialTarget === null) {
    return illegalAction(state, "Battle participants are stale or invalid.");
  }
  if (initialBattle.blocker !== undefined) {
    const blocker = reifyCardRef(resolutionState, initialBattle.blocker);
    if (
      blocker === null ||
      blocker.isLeader ||
      !sameCardRef(initialBattle.blocker, initialBattle.currentTarget)
    ) {
      return illegalAction(state, "Battle blocker is stale or invalid.");
    }
  }
  const events: EngineEvent[] = [];
  if (initialBattle.step !== "counter") {
    const counterStep = enterCounterStepAfterDefenderTiming(state);
    if (counterStep.result !== undefined) {
      return counterStep.result;
    }
    resolutionState = counterStep.state;
    events.push(...counterStep.events);
  }

  const battle = resolutionState.battle;
  if (battle === undefined) {
    return illegalAction(state, "No active battle to resolve.");
  }
  const attacker = reifyCardRef(resolutionState, battle.attacker);
  const target = reifyCardRef(resolutionState, battle.currentTarget);
  if (attacker === null || target === null) {
    return finalizeSupportedEndOfBattleCleanup({
      state,
      nextState: resolutionState,
      events,
    });
  }

  const combatState = withSupportedBattleRuntimeMetadataHidden(
    withAllAttackTimingCombatMetadataHidden(resolutionState),
  );
  let view: ReturnType<typeof computeView>;
  try {
    view = computeView(combatState);
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

  let nextState: GameState = {
    ...resolutionState,
    seq: toStateSeq(resolutionState.seq + 1),
  };

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
        return finalizeSupportedEndOfBattleCleanup({
          state,
          nextState,
          events,
          immediateLosers: [target.playerId],
          cleanupEventPosition: "afterRuleProcessing",
        });
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

  const koCandidates = detectBattleKOTriggerCandidates(nextState, events);
  if (!koCandidates.ok) {
    return toEngineResult(state, [], [koCandidates.error]);
  }

  return finalizeSupportedEndOfBattleCleanup({ state, nextState, events });
};

const enterCounterStepAfterDefenderTiming = (
  state: GameState,
):
  | { state: GameState; events: EngineEvent[]; result?: undefined }
  | { result: EngineResult; state?: undefined; events?: undefined } => {
  const battle = state.battle;
  if (battle === undefined) {
    return { result: illegalAction(state, "No active battle to resolve.") };
  }
  const counterState: GameState = {
    ...state,
    battle: { ...battle, step: "counter" },
  };
  const target = reifyCardRef(counterState, battle.currentTarget);
  if (target === null) {
    return {
      result: illegalAction(state, "Battle participants are stale or invalid."),
    };
  }
  const unsupportedCounterWindowReason = getUnsupportedCounterWindowReason(
    counterState,
    target.playerId,
  );
  if (unsupportedCounterWindowReason !== undefined) {
    return {
      result: unsupportedBattleResolution(
        state,
        unsupportedCounterWindowReason,
      ),
    };
  }

  const defenderTiming = processDefenderOpponentAttackTiming(counterState);
  if (defenderTiming.errors !== undefined) {
    return {
      result: toEngineResult(state, [], toErrorTuple(defenderTiming.errors)),
    };
  }
  const events = [...defenderTiming.events];
  if (defenderTiming.state.status.type !== "active") {
    return { result: defenderTiming };
  }
  if (!battleParticipantsRemainLegal(defenderTiming.state)) {
    return {
      result: finalizeSupportedEndOfBattleCleanup({
        state,
        nextState: defenderTiming.state,
        events,
      }),
    };
  }

  const decision = createCounterStepPassDecision(
    withAllAttackTimingCombatMetadataHidden(defenderTiming.state),
  );
  if (decision === null) {
    return { state: defenderTiming.state, events };
  }

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
    ...defenderTiming.state,
    pendingDecision: decision,
    eventJournal: [...state.eventJournal, ...events],
  };
  assertGameStateInvariants(nextState);
  return { result: toEngineResult(nextState, events) };
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

const finalizeSupportedEndOfBattleCleanup = ({
  state,
  nextState,
  events,
  immediateLosers,
  cleanupEventPosition = "beforeRuleProcessing",
}: {
  state: GameState;
  nextState: GameState;
  events: EngineEvent[];
  immediateLosers?: PlayerId[];
  cleanupEventPosition?: "beforeRuleProcessing" | "afterRuleProcessing";
}): EngineResult => {
  const clearedBattleState = expireBattleDurationStateForCleanup(nextState);
  const createRuleProcessingInput = () =>
    immediateLosers === undefined
      ? {
          state: clearedBattleState,
          events,
          phase: "main" as const,
          createEvent: (
            seqOffset: number,
            type: EngineEvent["type"],
            payload: unknown,
            visibility?: EngineEvent["visibility"],
          ) => createEvent(state, seqOffset, type, payload, visibility),
        }
      : {
          state: clearedBattleState,
          events,
          phase: "main" as const,
          createEvent: (
            seqOffset: number,
            type: EngineEvent["type"],
            payload: unknown,
            visibility?: EngineEvent["visibility"],
          ) => createEvent(state, seqOffset, type, payload, visibility),
          immediateLosers,
        };

  let finalizedState: GameState;
  if (cleanupEventPosition === "beforeRuleProcessing") {
    events.push(
      createEvent(
        state,
        events.length + 1,
        "effectResolved",
        { systemStep: "endBattle", battleCleared: true },
        { type: "replayOnly" },
      ),
    );
    finalizedState = applyRuleProcessingCheckpoint(createRuleProcessingInput());
  } else {
    finalizedState = applyRuleProcessingCheckpoint(createRuleProcessingInput());
    events.push(
      createEvent(
        state,
        events.length + 1,
        "effectResolved",
        { systemStep: "endBattle", battleCleared: true },
        { type: "replayOnly" },
      ),
    );
  }
  finalizedState.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(finalizedState);
  return toEngineResult(finalizedState, events);
};
