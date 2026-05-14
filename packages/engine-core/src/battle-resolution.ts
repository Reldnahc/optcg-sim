import type {
  CardInstance,
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
  illegalAction,
  rebaseEvents,
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
  detectPendingRuntimeWork,
  isSupportedDamageDeferredEffectQueueState,
  processDefenderOpponentAttackTiming,
  processEffectRuntime,
  queueBattleKOTriggers,
  releaseDamageDeferredEffectQueue,
} from "./effect-runtime.js";
import { assertGameStateInvariants } from "./invariants.js";
import {
  getSupportedLifeTriggerDecision,
  hasLifeTriggerText,
  registerLifeTriggerDamageContinuationResolver,
} from "./life-trigger-actions.js";
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

const isSupportedDoubleAttackDamageSource = (
  card: ResolvedCard | undefined,
): card is ResolvedCard => {
  const printedKeywords = card?.printedKeywords ?? [];
  return (
    card?.support.status === "implemented-dsl" &&
    card.support.effectDefinitionId === undefined &&
    (card.effectText ?? "").trim().length === 0 &&
    (card.triggerText ?? "").trim().length === 0 &&
    printedKeywords.includes("doubleAttack") &&
    !printedKeywords.includes("banish")
  );
};

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
  const pendingRuntimeWork = detectPendingRuntimeWork(state);
  if (
    (pendingRuntimeWork !== undefined &&
      !isSupportedDamageDeferredEffectQueueState(state)) ||
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
      withDamageDeferredEffectQueueMetadataHidden(
        withSupportedBattleRuntimeMetadataHidden(
          withAllAttackTimingCombatMetadataHidden(state),
        ),
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
  const attackerManifestCard =
    resolutionState.cardManifest.cards[battle.attacker.cardId];
  const attackerPrintedKeywords = attackerManifestCard?.printedKeywords ?? [];
  if (
    battle.damageCount === 2 &&
    !isSupportedDoubleAttackDamageSource(attackerManifestCard)
  ) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported keyword or protection handling.",
    );
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
  const shouldHideDoubleAttackForCombatView =
    (battle.damageCount === 2 ||
      battleWithInternal.damageProcess?.sourceKeyword === "doubleAttack") &&
    isSupportedDoubleAttackDamageSource(attackerManifestCard);
  const combatMetadataState = shouldHideDoubleAttackForCombatView
    ? {
        ...baseCombatMetadataState,
        cardManifest: {
          ...baseCombatMetadataState.cardManifest,
          cards: {
            ...baseCombatMetadataState.cardManifest.cards,
            [battle.attacker.cardId]: {
              ...attackerManifestCard,
              printedKeywords: attackerPrintedKeywords.filter(
                (keyword) => keyword !== "doubleAttack",
              ),
            },
          },
        },
      }
    : baseCombatMetadataState;
  const combatState = withSupportedBattleRuntimeMetadataHidden(
    withDamageDeferredEffectQueueMetadataHidden(
      withAllAttackTimingCombatMetadataHidden(combatMetadataState),
    ),
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
  const battleDamageCount = battle.damageCount;
  if (battleDamageCount !== 1 && battleDamageCount !== 2) {
    return unsupportedBattleResolution(
      state,
      "Battle requires unsupported blocker, step, or multi-damage behavior.",
    );
  }
  if (targetView.protectedFrom.length > 0) {
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
      if (battleDamageCount === 2 && attackerHasBanish) {
        return unsupportedBattleResolution(
          state,
          "Battle requires unsupported keyword or protection handling.",
        );
      }
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
        });
        if (point.result !== undefined) {
          return point.result;
        }
        nextState = point.state;
        if (point.pausedForLifeTrigger) {
          nextState.eventJournal = [...state.eventJournal, ...events];
          assertGameStateInvariants(nextState);
          return toEngineResult(nextState, events);
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
      shouldDetectBattleKOTriggers = hasOnKODefinitionMetadata(
        state,
        target.card,
      );
      const koMovePayload = {
        from: target.card.zone,
        to: trashedCard.zone,
        reason: "ko",
      };
      appendEvent(
        state,
        events,
        "cardMoved",
        shouldDetectBattleKOTriggers
          ? {
              instanceId: trashedCard.instanceId,
              cardId: trashedCard.cardId,
              ...koMovePayload,
            }
          : koMovePayload,
      );
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
      return toEngineResult(state, [], [queued.error]);
    }
    nextState = queued.state;
    if (nextState.effectQueue.length > 0) {
      const runtimeState: GameState = {
        ...nextState,
        eventJournal: [...state.eventJournal, ...events],
      };
      const resolved = processEffectRuntime(runtimeState);
      if (resolved.errors !== undefined) {
        return toEngineResult(state, [], toErrorTuple(resolved.errors));
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

  return finalizeSupportedEndOfBattleCleanup({ state, nextState, events });
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
}: {
  state: GameState;
  nextState: GameState;
  events: EngineEvent[];
  attackerInstanceId: CardInstance["instanceId"];
  targetInstanceId: CardInstance["instanceId"];
  targetPlayerId: PlayerId;
  attackerHasBanish: boolean;
  remainingDamagePoints: number;
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
      }),
    };
  }
  const lifeMeta = nextState.cardManifest.cards[topLife.card.cardId];
  const supportedLifeTriggerDecision = attackerHasBanish
    ? undefined
    : getSupportedLifeTriggerDecision(nextState, targetPlayerId, topLife.card);
  if (
    !attackerHasBanish &&
    hasLifeTriggerText(lifeMeta?.triggerText) &&
    supportedLifeTriggerDecision === undefined
  ) {
    return {
      result: unsupportedBattleResolution(
        state,
        "Life trigger reveal decisions are unsupported in this battle path.",
      ),
    };
  }
  appendEvent(state, events, "damageDealt", {
    attacker: attackerInstanceId,
    target: targetInstanceId,
    amount: 1,
  });
  if (supportedLifeTriggerDecision === undefined) {
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
      : reindexZoneCards(
          [movedLifeCard, ...damaged.hand],
          "hand",
          targetPlayerId,
          "hand",
        );
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
          playerId: targetPlayerId,
          slot: "life",
          index: 0,
        },
        to: movedLifeCard.zone,
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
      decisionId: supportedLifeTriggerDecision.id,
      decisionType: supportedLifeTriggerDecision.type,
      playerId: supportedLifeTriggerDecision.playerId,
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
    pendingDecision: supportedLifeTriggerDecision,
  };
  return {
    state: stateWithDecision,
    pausedForLifeTrigger: remainingDamagePoints > 0,
  };
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
    );
  }
  if (
    releasedState.effectQueue.length > 0 &&
    finalizedState.deferredTriggers.length > 0
  ) {
    const resolved = processEffectRuntime(releasedState);
    if (resolved.errors !== undefined) {
      return toEngineResult(state, [], toErrorTuple(resolved.errors));
    }
    assertGameStateInvariants(resolved.state);
    return toEngineResult(resolved.state, [...events, ...resolved.events]);
  }

  assertGameStateInvariants(finalizedState);
  return toEngineResult(finalizedState, events);
};

registerLifeTriggerDamageContinuationResolver(resolveSupportedVanillaBattle);
