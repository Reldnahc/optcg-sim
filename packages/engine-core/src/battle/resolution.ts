import type {
  CardInstance,
  CardRef,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";
type EngineInternalBattleState = NonNullable<GameState["battle"]> & {
  damageProcess?: {
    type?: string;
    sourceKeyword?: string;
    remainingDamagePoints?: number;
  };
};
type EngineInternalGameState = GameState & {
  battle?: EngineInternalBattleState;
};

import {
  appendEvent,
  createEvent,
  type EngineResultOptions,
  illegalAction,
  rebaseEvents,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import {
  addCardsToHand,
  reifyCardRef,
  reindexZoneCards,
} from "../actions/state.js";
import {
  expireBattleDurationStateForCleanup,
  isSupportedBattleResolutionEnvelope,
  isSupportedCounterStepTarget,
  sameCardRef,
} from "./support.js";
import { normalizeBattleTargetDamageCount } from "./targeting.js";
import {
  createCounterStepPassDecision,
  getUnsupportedCounterWindowReason,
} from "./counter-actions.js";
import { getSupportedBattleCombatView } from "./capabilities.js";
import {
  KO_TRASH_MOVEMENT_REASON,
  moveConcreteCardsToTrash,
} from "../concrete-card-movement.js";
import {
  detectPendingRuntimeWork,
  isSupportedDamageDeferredEffectQueueState,
  processEffectRuntime,
  queueBattleKOTriggers,
  releaseDamageDeferredEffectQueue,
} from "../effect-runtime.js";
import { continueRuntimeUntilIdle } from "../effect-runtime-decision-continuation.js";
import {
  buildFieldRemovalKoReplacementProcess,
  detectSupportedFieldRemovalReplacementCandidate,
  pauseFieldRemovalReplacementProcess,
} from "../replacement/field-removal-process.js";
import { assertGameStateInvariants } from "../state/invariants.js";
import {
  getLifeDamageDecision,
  registerLifeTriggerDamageContinuationResolver,
} from "../life-trigger/actions.js";
import { applyRuleProcessingCheckpoint } from "../rules/rule-processing.js";

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

const hasPrintedDoubleAttackDamageSource = (
  card: ResolvedCard | undefined,
): card is ResolvedCard =>
  (card?.printedKeywords ?? []).includes("doubleAttack");

const hasOnKODefinitionMetadata = (
  state: GameState,
  card: CardInstance,
): boolean => {
  const resolved = state.cardManifest.cards[card.cardId];
  const effectDefinitionId = resolved?.support.effectDefinitionId;
  if (effectDefinitionId === undefined) {
    return false;
  }
  return (
    state.cardManifest.effectDefinitions?.[effectDefinitionId]?.effects.some(
      (effect) => effect.trigger.type === "onKO",
    ) ?? false
  );
};

const withDamageDeferredEffectQueueMetadataHidden = (
  state: GameState,
): GameState => {
  if (!isSupportedDamageDeferredEffectQueueState(state)) {
    return state;
  }
  const entry = state.effectQueue[0];
  if (entry === undefined) {
    return state;
  }
  const metadata = state.cardManifest.cards[entry.source.cardId];
  if (metadata === undefined) {
    return state;
  }
  const sanitizedSupport: ResolvedCard["support"] = { ...metadata.support };
  delete sanitizedSupport.effectDefinitionId;
  const { effectText, triggerText, ...metadataWithoutText } = metadata;
  void effectText;
  void triggerText;
  const definitions = Object.fromEntries(
    Object.entries(state.cardManifest.effectDefinitions ?? {}).filter(
      ([, definition]) => definition.cardId !== entry.source.cardId,
    ),
  );
  return {
    ...state,
    cardManifest: {
      ...state.cardManifest,
      cards: {
        ...state.cardManifest.cards,
        [entry.source.cardId]: {
          ...metadataWithoutText,
          support: sanitizedSupport,
        },
      },
      effectDefinitions: definitions,
    },
  };
};

export const resolveSupportedVanillaBattle = (
  state: GameState,
  options: EngineResultOptions = {},
): EngineResult => {
  let resolutionState = state;
  if (resolutionState.battle === undefined) {
    return illegalAction(state, "No active battle to resolve.");
  }
  const normalizedBattle = normalizeBattleTargetDamageCount(
    resolutionState,
    resolutionState.battle,
  );
  if (normalizedBattle === null) {
    return illegalAction(state, "Battle participants are stale or invalid.");
  }
  const initialBattle = normalizedBattle;
  resolutionState = { ...resolutionState, battle: initialBattle };
  if (!isSupportedBattleResolutionEnvelope(initialBattle)) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported blocker, step, or multi-damage behavior.",
    );
  }
  const pendingRuntimeWork = detectPendingRuntimeWork(state);
  if (
    (pendingRuntimeWork !== undefined &&
      !isSupportedDamageDeferredEffectQueueState(state)) ||
    state.replacementState.length > 0
  ) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported trigger or replacement processing.",
    );
  }
  const initialAttacker = reifyCardRef(resolutionState, initialBattle.attacker);
  const initialTarget = reifyCardRef(
    resolutionState,
    initialBattle.currentTarget,
  );
  if (initialAttacker === null || initialTarget === null) {
    return illegalAction(state, "Battle participants are stale or invalid.");
  }
  const attackerManifestCard =
    resolutionState.cardManifest.cards[initialBattle.attacker.cardId];
  if (!initialTarget.isLeader && initialBattle.damageCount !== 1) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported blocker, step, or multi-damage behavior.",
    );
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
    const counterStep = enterCounterStep(resolutionState, options);
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
      options,
    });
  }

  const baseCombatMetadataState =
    battle.damageCount === 1
      ? resolutionState
      : {
          ...resolutionState,
          battle: {
            ...battle,
            damageCount: 1,
          },
        };
  const battleWithInternal = battle as EngineInternalBattleState;
  const attackerHasPrintedDoubleAttack =
    hasPrintedDoubleAttackDamageSource(attackerManifestCard);
  const combatMetadataState = baseCombatMetadataState;
  const combatState =
    withDamageDeferredEffectQueueMetadataHidden(combatMetadataState);
  const combat = getSupportedBattleCombatView(combatState, battle);
  if ("reason" in combat) {
    return unsupportedBattleResolution(state, combat.reason);
  }
  const { attackerView, targetView } = combat;
  const attackerHasBanish = attackerView.keywords.includes("banish");
  const battleDamageCount = battle.damageCount;
  if (battleDamageCount !== 1 && battleDamageCount !== 2) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported blocker, step, or multi-damage behavior.",
    );
  }
  if (
    battleDamageCount === 2 &&
    !attackerView.keywords.includes("doubleAttack") &&
    !attackerHasPrintedDoubleAttack &&
    battleWithInternal.damageProcess?.sourceKeyword !== "doubleAttack"
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
  let shouldDetectBattleKOTriggers = false;

  if (attackerView.currentPower >= targetView.currentPower) {
    if (target.isLeader) {
      for (let index = 0; index < battleDamageCount; index += 1) {
        const remainingDamagePoints = battleDamageCount - index - 1;
        const point = processLeaderDamagePoint({
          state,
          nextState,
          events,
          attackerInstanceId: attacker.card.instanceId,
          targetInstanceId: target.card.instanceId,
          targetPlayerId: target.playerId,
          attackerHasBanish,
          remainingDamagePoints,
          options,
        });
        if (point.result !== undefined) {
          return point.result;
        }
        nextState = point.state;
        if (point.pausedForLifeTrigger) {
          nextState.eventJournal = [...state.eventJournal, ...events];
          assertGameStateInvariants(nextState);
          return toEngineResult(nextState, events, undefined, options);
        }
      }
    } else {
      const defender = nextState.players[target.playerId];
      if (defender === undefined) {
        return illegalAction(state, "Battle target player does not exist.");
      }
      const koIndex = defender.characters.findIndex(
        (character) => character.instanceId === target.card.instanceId,
      );
      if (koIndex < 0 || !isSupportedCounterStepTarget(battle, target)) {
        return unsupportedBattleResolution(
          state,
          "Battle target is no longer a supported rested character target.",
        );
      }
      const koCard = defender.characters[koIndex];
      if (koCard === undefined) {
        return illegalAction(state, "K.O. target not found.");
      }
      appendEvent(state, events, "damageDealt", {
        attacker: attacker.card.instanceId,
        target: target.card.instanceId,
        amount: 1,
      });
      const battleKoProcessSource: CardRef = {
        instanceId: attacker.card.instanceId,
        cardId: attacker.card.cardId,
        playerId: attacker.playerId,
        zone: attacker.card.zone,
      };
      const battleKoProcessTarget: CardRef = {
        instanceId: koCard.instanceId,
        cardId: koCard.cardId,
        playerId: target.playerId,
        zone: koCard.zone,
      };
      const battleKoProcess = buildFieldRemovalKoReplacementProcess({
        id: `battle:${String(state.seq)}:ko:${String(koCard.instanceId)}`,
        effectId: "battle:character-ko-replacement",
        source: battleKoProcessSource,
        target: battleKoProcessTarget,
        causedBy: { type: "ruleProcess", name: "battle:characterKO" },
        sourceKind: "battle",
        sourceControllerId: attacker.playerId,
        battleContinuation: { type: "endBattleAfterCharacterKoAttempt" },
      });
      const replacement = detectSupportedFieldRemovalReplacementCandidate(
        nextState,
        battleKoProcess,
      );
      if (!replacement.ok) {
        return toEngineResult(state, [], [replacement.error], options);
      }
      const replacementCandidates =
        replacement.candidates ??
        (replacement.candidate === undefined ? [] : [replacement.candidate]);
      if (replacementCandidates.length > 0) {
        const paused = pauseFieldRemovalReplacementProcess(
          nextState,
          events,
          battleKoProcess,
          replacementCandidates,
        );
        assertGameStateInvariants(paused.state);
        return toEngineResult(paused.state, events, undefined, options);
      }
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
            costArea: nextCostArea,
          },
        },
      };
      appendEvent(state, events, "cardKOd", {
        playerId: target.playerId,
        instanceId: target.card.instanceId,
      });
      shouldDetectBattleKOTriggers = hasOnKODefinitionMetadata(
        state,
        target.card,
      );
      const movedResult = moveConcreteCardsToTrash(
        nextState,
        events,
        [koCard],
        {
          cardMovedPayloadShape: "zoneRefs",
          clearAttachedDon: true,
          emitCardTrashed: false,
          eventBaseState: state,
          includeCardIdentityInCardMoved: shouldDetectBattleKOTriggers,
          playerId: target.playerId,
          reason: KO_TRASH_MOVEMENT_REASON,
          sourceZone: "characterArea",
        },
      );
      nextState = movedResult.state;
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

  if (shouldDetectBattleKOTriggers) {
    const queued = queueBattleKOTriggers(nextState, state, events);
    if (!queued.ok) {
      return toEngineResult(state, [], [queued.error], options);
    }
    nextState = queued.state;
    if (nextState.effectQueue.length > 0) {
      const runtimeState: GameState = {
        ...nextState,
        eventJournal: [...state.eventJournal, ...events],
      };
      const resolved = processEffectRuntime(runtimeState, options);
      if (resolved.errors !== undefined) {
        return toEngineResult(
          state,
          [],
          toErrorTuple(resolved.errors),
          options,
        );
      }
      const runtimeEvents = rebaseEvents(
        state,
        resolved.events,
        events.length + 1,
      );
      events.push(...runtimeEvents);
      nextState = {
        ...resolved.state,
        eventJournal: [...state.eventJournal, ...events],
      };
    }
  }

  return finalizeSupportedEndOfBattleCleanup({
    state,
    nextState,
    events,
    options,
  });
};

const processLeaderDamagePoint = ({
  state,
  nextState,
  events,
  attackerInstanceId,
  targetInstanceId,
  targetPlayerId,
  attackerHasBanish,
  remainingDamagePoints,
  options,
}: {
  state: GameState;
  nextState: GameState;
  events: EngineEvent[];
  attackerInstanceId: CardInstance["instanceId"];
  targetInstanceId: CardInstance["instanceId"];
  targetPlayerId: PlayerId;
  attackerHasBanish: boolean;
  remainingDamagePoints: number;
  options: EngineResultOptions;
}):
  | { state: GameState; pausedForLifeTrigger: boolean; result?: undefined }
  | { result: EngineResult; state?: undefined } => {
  const damaged = nextState.players[targetPlayerId];
  const topLife = damaged?.life[0];
  if (damaged === undefined) {
    return {
      result: illegalAction(state, "Battle target player does not exist."),
    };
  }
  if (topLife === undefined) {
    appendEvent(state, events, "damageDealt", {
      attacker: attackerInstanceId,
      target: targetInstanceId,
      amount: 1,
    });
    return {
      result: finalizeSupportedEndOfBattleCleanup({
        state,
        nextState,
        events,
        immediateLosers: [targetPlayerId],
        cleanupEventPosition: "afterRuleProcessing",
        options,
      }),
    };
  }
  const lifeDamageDecision = attackerHasBanish
    ? undefined
    : getLifeDamageDecision(nextState, targetPlayerId, topLife.card);
  appendEvent(state, events, "damageDealt", {
    attacker: attackerInstanceId,
    target: targetInstanceId,
    amount: 1,
  });
  if (lifeDamageDecision === undefined) {
    const movedLifeCard: CardInstance = {
      ...topLife.card,
      zone: {
        zone: attackerHasBanish ? "trash" : "hand",
        playerId: targetPlayerId,
        slot: attackerHasBanish ? "trash" : "hand",
        index: 0,
      },
    };
    const nextHand = attackerHasBanish
      ? damaged.hand
      : addCardsToHand(damaged.hand, [movedLifeCard], targetPlayerId);
    const nextTrash = attackerHasBanish
      ? reindexZoneCards(
          [movedLifeCard, ...damaged.trash],
          "trash",
          targetPlayerId,
          "trash",
        )
      : damaged.trash;
    const nextLife = damaged.life.slice(1).map((lifeCard, index) => ({
      ...lifeCard,
      card: {
        ...lifeCard.card,
        zone: {
          zone: "life",
          playerId: targetPlayerId,
          slot: "life",
          index,
        },
      },
    }));
    const updatedState: GameState = {
      ...nextState,
      players: {
        ...nextState.players,
        [targetPlayerId]: {
          ...damaged,
          hand: nextHand,
          life: nextLife,
          trash: nextTrash,
        },
      },
    };
    appendEvent(state, events, "lifeTaken", {
      damagedPlayerId: targetPlayerId,
      amount: 1,
    });
    appendEvent(
      state,
      events,
      "cardMoved",
      {
        from: {
          zone: "life",
          playerId: targetPlayerId,
          slot: "life",
          index: 0,
        },
        to: {
          zone: attackerHasBanish ? "trash" : "hand",
          playerId: targetPlayerId,
          slot: attackerHasBanish ? "trash" : "hand",
          index: attackerHasBanish ? 0 : nextHand.length - 1,
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
          playerId: targetPlayerId,
          slot: "life",
          index: 0,
        },
        to: attackerHasBanish
          ? movedLifeCard.zone
          : (nextHand[nextHand.length - 1]?.zone ?? movedLifeCard.zone),
        reason: "battleDamage",
      },
      { type: "private", playerId: targetPlayerId },
    );
    return { state: updatedState, pausedForLifeTrigger: false };
  }

  const nextLife = damaged.life.slice(1).map((lifeCard, index) => ({
    ...lifeCard,
    card: {
      ...lifeCard.card,
      zone: {
        zone: "life",
        playerId: targetPlayerId,
        slot: "life",
        index,
      },
    },
  }));
  appendEvent(state, events, "lifeTaken", {
    damagedPlayerId: targetPlayerId,
    amount: 1,
  });
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: lifeDamageDecision.id,
      decisionType: lifeDamageDecision.type,
      playerId: lifeDamageDecision.playerId,
    },
    { type: "private", playerId: targetPlayerId },
  );
  const nextBattleWithProcess: EngineInternalBattleState | undefined =
    remainingDamagePoints > 0 && nextState.battle !== undefined
      ? ({
          ...nextState.battle,
          damageCount: remainingDamagePoints,
          damageProcess: {
            type: "multipleDamage",
            sourceKeyword: "doubleAttack",
            remainingDamagePoints,
          },
        } satisfies EngineInternalBattleState)
      : undefined;
  const stateWithDecision: EngineInternalGameState = {
    ...nextState,
    ...(nextBattleWithProcess === undefined
      ? {}
      : { battle: nextBattleWithProcess }),
    players: {
      ...nextState.players,
      [targetPlayerId]: {
        ...damaged,
        life: nextLife,
      },
    },
    pendingDecision: lifeDamageDecision,
  };
  return {
    state: stateWithDecision,
    pausedForLifeTrigger: remainingDamagePoints > 0,
  };
};

const enterCounterStep = (
  state: GameState,
  options: EngineResultOptions,
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

  const decision = createCounterStepPassDecision(counterState, {
    requirePotentialCounterActions: false,
  });
  if (decision === null) {
    return { state: counterState, events: [] };
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
  return { result: toEngineResult(nextState, events, undefined, options) };
};

const finalizeSupportedEndOfBattleCleanup = ({
  state,
  nextState,
  events,
  immediateLosers,
  cleanupEventPosition = "beforeRuleProcessing",
  options = {},
}: {
  state: GameState;
  nextState: GameState;
  events: EngineEvent[];
  immediateLosers?: PlayerId[];
  cleanupEventPosition?: "beforeRuleProcessing" | "afterRuleProcessing";
  options?: EngineResultOptions;
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

  const battle = nextState.battle ?? state.battle;
  if (battle !== undefined) {
    events.push(
      createEvent(
        state,
        events.length + 1,
        "battleEnded",
        {
          attacker: battle.attacker,
          target: battle.currentTarget,
          originalTarget: battle.originalTarget,
          ...(battle.blocker === undefined ? {} : { blocker: battle.blocker }),
        },
        { type: "public" },
      ),
    );
  }

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

  const releasedState = releaseDamageDeferredEffectQueue(finalizedState);
  if (releasedState === null) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "effectRuntimeError",
          effectId: "unsupported-effect-queue",
          details: {
            reason: "unsupported-pending-runtime-work",
            kind: "effectQueue",
            count: finalizedState.effectQueue.length,
          },
        },
      ],
      options,
    );
  }
  if (
    releasedState.effectQueue.length > 0 &&
    finalizedState.deferredTriggers.length > 0
  ) {
    const resolved = processEffectRuntime(releasedState, options);
    if (resolved.errors !== undefined) {
      return toEngineResult(state, [], toErrorTuple(resolved.errors), options);
    }
    assertGameStateInvariants(resolved.state);
    return toEngineResult(
      resolved.state,
      [...events, ...resolved.events],
      undefined,
      options,
    );
  }
  if (events.some((event) => event.type === "damageDealt")) {
    const runtime = continueRuntimeUntilIdle(
      state,
      processEffectRuntime(releasedState, options),
      options,
    );
    if (runtime.errors !== undefined) {
      return toEngineResult(state, [], toErrorTuple(runtime.errors), options);
    }
    assertGameStateInvariants(runtime.state);
    return toEngineResult(
      runtime.state,
      [...events, ...runtime.events],
      undefined,
      options,
    );
  }

  assertGameStateInvariants(releasedState);
  return toEngineResult(releasedState, events, undefined, options);
};

export const finalizeBattleAfterReplacementResolution = (
  state: GameState,
  nextState: GameState,
  events: EngineEvent[],
  options: EngineResultOptions = {},
): EngineResult =>
  finalizeSupportedEndOfBattleCleanup({
    state,
    nextState,
    events,
    options,
  });

registerLifeTriggerDamageContinuationResolver(resolveSupportedVanillaBattle);
