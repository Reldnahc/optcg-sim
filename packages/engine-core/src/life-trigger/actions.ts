import type {
  Action,
  CardRef,
  CardInstance,
  ConfirmLifeTriggerDecision,
  EffectBlock,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";
type EngineInternalBattleState = NonNullable<GameState["battle"]> & {
  damageProcess?: {
    type?: string;
    remainingDamagePoints?: number;
  };
};

import {
  appendEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { addCardsToHand, reifyCardRef } from "../actions/state.js";
import { isSupportedBattleResolutionEnvelope } from "../battle/support.js";
import {
  processEffectRuntime,
  releaseDamageDeferredEffectQueue,
  resolveImplementedDslEffectDefinition,
} from "../effect-runtime.js";
import { evaluateQueuedEffectCondition } from "../effect-runtime-conditions.js";
import { continueRuntimeAfterDecisionResult } from "../effect-runtime-decision-continuation.js";
import { isSupportedQueuedAutoSequenceForEntryPoint } from "../effect-runtime-sequence/support.js";
import { effectQueueEntryPresentationForEffectBlock } from "../runtime/effect-presentation.js";
import { assertGameStateInvariants } from "../state/invariants.js";

export const hasLifeTriggerText = (triggerText: string | undefined): boolean =>
  triggerText !== undefined && triggerText.trim().length > 0;

type DamageContinuationResolver = (state: GameState) => EngineResult;

let damageContinuationResolver: DamageContinuationResolver | undefined;

export const registerLifeTriggerDamageContinuationResolver = (
  resolver: DamageContinuationResolver,
): void => {
  damageContinuationResolver = resolver;
};

const isSupportedTriggerEffect = (effect: EffectBlock): boolean => {
  if (effect.category !== "auto") return false;
  if (effect.trigger.type !== "trigger") return false;
  if (
    effect.sourcePresencePolicy !== "resolveFromLastKnownInformation" &&
    effect.sourcePresencePolicy !== "noSourceRequired"
  ) {
    return false;
  }
  if (effect.cost !== undefined) return false;
  if (effect.conditionTiming !== undefined) return false;
  if (effect.failurePolicy !== undefined) return false;
  if (effect.optional !== undefined && effect.optional) return false;
  if (effect.optional === false) return false;
  if (effect.oncePerTurn !== undefined && effect.oncePerTurn) return false;
  if (effect.oncePerTurn === false) return false;
  return isSupportedTriggerQueuedBody(effect);
};

const isSupportedTriggerQueuedBody = (effectBlock: EffectBlock): boolean => {
  const effect = effectBlock.effect;
  if (
    effect.type === "activateReferencedEffect" &&
    effect.source.type === "triggerCard" &&
    (effect.trigger.type === "main" || effect.trigger.type === "onPlay")
  ) {
    return true;
  }
  if (
    effect.type === "playSource" &&
    effect.source.type === "triggerCard" &&
    effect.ignoreCost === true
  ) {
    return true;
  }
  if (effect.type === "draw") {
    return (
      Number.isInteger(effect.count) &&
      effect.count >= 0 &&
      effect.player === "self"
    );
  }
  if (effect.type === "drawUpTo") {
    return (
      Number.isInteger(effect.count) &&
      effect.count >= 0 &&
      effect.player === "self"
    );
  }
  if (effect.type === "sequence") {
    if (effectBlock.sourcePresencePolicy === undefined) {
      return false;
    }
    return isSupportedQueuedAutoSequenceForEntryPoint(
      effectBlock,
      "trigger",
      effectBlock.sourcePresencePolicy,
      { allowSavedReferences: false },
    );
  }
  return false;
};

const hasUnsupportedShape = (effect: EffectBlock): boolean =>
  !isSupportedTriggerQueuedBody(effect) ||
  effect.cost !== undefined ||
  effect.conditionTiming !== undefined ||
  effect.failurePolicy !== undefined ||
  effect.optional !== undefined ||
  effect.oncePerTurn !== undefined;

const selectSupportedTriggerEffects = (
  effects: readonly EffectBlock[],
): readonly EffectBlock[] | undefined => {
  const triggerEffects = effects.filter(
    (effect) => effect.trigger.type === "trigger",
  );
  if (triggerEffects.length === 0) {
    return undefined;
  }
  if (
    triggerEffects.some(
      (effect) =>
        hasUnsupportedShape(effect) || !isSupportedTriggerEffect(effect),
    )
  ) {
    return undefined;
  }
  return triggerEffects;
};

const resolveSupportedLifeTriggerEffect = (
  state: GameState,
  card: Pick<CardRef, "instanceId" | "cardId" | "playerId">,
): { resolved: ResolvedCard; effects: readonly EffectBlock[] } | undefined => {
  const resolved = state.cardManifest.cards[card.cardId];
  if (resolved === undefined || !hasLifeTriggerText(resolved.triggerText)) {
    return undefined;
  }
  const lookup = resolveImplementedDslEffectDefinition(
    resolved,
    state.cardManifest,
  );
  if (!lookup.ok) {
    return undefined;
  }
  const effects = selectSupportedTriggerEffects(lookup.definition.effects);
  if (effects === undefined) {
    return undefined;
  }
  if (
    effects.some(
      (effect) =>
        !isSupportedLifeTriggerConditionInNoZoneContext(
          state,
          resolved,
          effect,
          card,
        ),
    )
  ) {
    return undefined;
  }
  return { resolved, effects };
};

const isSupportedLifeTriggerConditionInNoZoneContext = (
  state: GameState,
  resolved: ResolvedCard,
  effect: EffectBlock,
  card: Pick<CardRef, "instanceId" | "cardId" | "playerId">,
): boolean => {
  const sourcePresencePolicy = effect.sourcePresencePolicy;
  if (sourcePresencePolicy === undefined) {
    return false;
  }
  const noZone = {
    zone: "noZone" as const,
    playerId: card.playerId,
    slot: "temporary" as const,
  };
  const source: CardRef = {
    instanceId: card.instanceId,
    cardId: card.cardId,
    playerId: card.playerId,
    zone: noZone,
  };
  const preflightEntry: EffectQueueEntry = {
    id: `queue-entry:life-trigger-preflight:${String(card.instanceId)}:${String(
      effect.id,
    )}` as EffectQueueEntry["id"],
    state: "pending",
    timingWindowId: `timing-window:life-trigger-preflight:${String(
      card.instanceId,
    )}` as EffectQueueEntry["timingWindowId"],
    generation: 0,
    controllerId: card.playerId,
    source,
    sourceSnapshot: toSourceSnapshot(source, resolved),
    effectBlockId: effect.id,
    orderingGroup:
      card.playerId === state.turn.turnPlayerId
        ? "turnPlayer"
        : "nonTurnPlayer",
    createdAtEventSeq: state.eventJournal.length + 1,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy,
    causedBy: { type: "ruleProcess", name: "battle:lifeTriggerDecision" },
  };
  return evaluateQueuedEffectCondition(state, preflightEntry, effect.condition)
    .supported;
};

export const getSupportedLifeTriggerDecision = (
  state: GameState,
  damagedPlayerId: PlayerId,
  card: CardInstance,
): ConfirmLifeTriggerDecision | undefined => {
  if (
    resolveSupportedLifeTriggerEffect(state, {
      cardId: card.cardId,
      instanceId: card.instanceId,
      playerId: damagedPlayerId,
    }) === undefined
  ) {
    return undefined;
  }
  return {
    id: toDecisionId(
      `decision:life-trigger:${String(card.instanceId)}:${String(state.seq + 1)}`,
    ),
    type: "confirmLifeTrigger",
    playerId: damagedPlayerId,
    prompt: "Activate life trigger?",
    causedBy: { type: "ruleProcess", name: "battle:lifeTriggerDecision" },
    visibility: { type: "public" },
    card: {
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: damagedPlayerId,
    },
    options: ["activateTrigger", "addToHand"],
  };
};

const getAddToHandOnlyLifeTriggerDecision = (
  state: GameState,
  damagedPlayerId: PlayerId,
  card: CardInstance,
): ConfirmLifeTriggerDecision => ({
  id: toDecisionId(
    `decision:life-trigger:${String(card.instanceId)}:${String(state.seq + 1)}`,
  ),
  type: "confirmLifeTrigger",
  playerId: damagedPlayerId,
  prompt: "Activate life trigger?",
  causedBy: { type: "ruleProcess", name: "battle:lifeTriggerDecision" },
  visibility: { type: "public" },
  card: {
    instanceId: card.instanceId,
    cardId: card.cardId,
    playerId: damagedPlayerId,
  },
  options: ["addToHand"],
});

export const getLifeDamageDecision = (
  state: GameState,
  damagedPlayerId: PlayerId,
  card: CardInstance,
): ConfirmLifeTriggerDecision | undefined => {
  const resolved = state.cardManifest.cards[card.cardId];
  if (resolved === undefined) {
    return undefined;
  }
  if (hasLifeTriggerText(resolved.triggerText)) {
    return (
      getSupportedLifeTriggerDecision(state, damagedPlayerId, card) ??
      getAddToHandOnlyLifeTriggerDecision(state, damagedPlayerId, card)
    );
  }
  return getAddToHandOnlyLifeTriggerDecision(state, damagedPlayerId, card);
};

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const toErrorTuple = (
  errors: readonly EngineError[],
): readonly [EngineError, ...EngineError[]] => {
  const first = errors[0];
  if (first === undefined) {
    return [
      {
        type: "effectRuntimeError",
        effectId: "life-trigger-effect-runtime",
        details: { reason: "empty-runtime-error-list" },
      },
    ];
  }
  return [first, ...errors.slice(1)];
};

const isCardInNormalZone = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): boolean =>
  Object.values(state.players).some((player) => {
    if (player.leader.instanceId === instanceId) return true;
    if (player.stage?.instanceId === instanceId) return true;
    return (
      player.deck.some((card) => card.instanceId === instanceId) ||
      player.donDeck.some((card) => card.instanceId === instanceId) ||
      player.hand.some((card) => card.instanceId === instanceId) ||
      player.trash.some((card) => card.instanceId === instanceId) ||
      player.characters.some((card) => card.instanceId === instanceId) ||
      player.costArea.some((card) => card.instanceId === instanceId) ||
      player.life.some((lifeCard) => lifeCard.card.instanceId === instanceId)
    );
  });

const toSourceSnapshot = (
  card: CardRef,
  resolved: ResolvedCard,
): EffectQueueEntry["sourceSnapshot"] => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId: card.playerId,
  controllerId: card.playerId,
  zone: card.zone ?? {
    zone: "noZone",
    playerId: card.playerId,
    slot: "temporary",
  },
  category: resolved.category,
  colors: resolved.colors,
  ...(resolved.cost !== undefined ? { cost: resolved.cost } : {}),
  ...(resolved.power !== undefined ? { power: resolved.power } : {}),
  ...(resolved.counter !== undefined ? { counter: resolved.counter } : {}),
  ...(resolved.life !== undefined ? { life: resolved.life } : {}),
  keywords: resolved.printedKeywords,
});

const validateDecisionCard = (
  state: GameState,
  decision: ConfirmLifeTriggerDecision,
): EngineResult | undefined => {
  if (decision.card.playerId !== decision.playerId) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger card player does not match decision."),
    );
  }
  if (state.cardManifest.cards[decision.card.cardId] === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger card metadata is missing."),
    );
  }
  if (isCardInNormalZone(state, decision.card.instanceId)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger card is stale for current state."),
    );
  }
  return undefined;
};

export const getLifeTriggerLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  const resolved =
    decision?.type === "confirmLifeTrigger"
      ? state.cardManifest.cards[decision.card.cardId]
      : undefined;
  if (
    decision === undefined ||
    decision.type !== "confirmLifeTrigger" ||
    decision.playerId !== playerId ||
    resolved === undefined
  ) {
    return [];
  }
  const supportedTrigger = hasLifeTriggerText(resolved.triggerText)
    ? resolveSupportedLifeTriggerEffect(state, {
        cardId: decision.card.cardId,
        instanceId: decision.card.instanceId,
        playerId: decision.card.playerId,
      })
    : undefined;
  const canActivate =
    decision.options.includes("activateTrigger") &&
    supportedTrigger !== undefined;
  const canAddToHand = decision.options.includes("addToHand");
  return getAvailableLifeTriggerLegalActions(
    decision,
    canActivate,
    canAddToHand,
  );
};

const isLifeTriggerChoiceAvailable = (
  decision: ConfirmLifeTriggerDecision,
  choice: string,
): boolean =>
  (choice === "activateTrigger" || choice === "addToHand") &&
  decision.options.includes(choice);

const getUnavailableLifeTriggerChoiceError = (state: GameState): EngineResult =>
  toEngineResult(
    state,
    [],
    invalidDecision("Life Trigger choice is not available."),
  );

const getAvailableLifeTriggerLegalActions = (
  decision: ConfirmLifeTriggerDecision,
  canActivate: boolean,
  canAddToHand: boolean,
): LegalAction[] => [
  ...(canActivate
    ? [
        {
          type: "respondToDecision" as const,
          decisionId: decision.id,
          response: {
            type: "lifeTrigger" as const,
            choice: "activateTrigger" as const,
          },
        },
      ]
    : []),
  ...(canAddToHand
    ? [
        {
          type: "respondToDecision" as const,
          decisionId: decision.id,
          response: {
            type: "lifeTrigger" as const,
            choice: "addToHand" as const,
          },
        },
      ]
    : []),
];

const malformedContinuation = (state: GameState): EngineResult =>
  toEngineResult(
    state,
    [],
    invalidDecision("Life Trigger damage continuation is malformed."),
  );

const validateDamageContinuation = (
  state: GameState,
): EngineResult | undefined => {
  const battle = state.battle;
  const battleWithInternal = battle as EngineInternalBattleState | undefined;
  if (battle === undefined) {
    return undefined;
  }
  if (
    battle.damageCount !== 1 ||
    battleWithInternal?.damageProcess?.type !== "multipleDamage" ||
    battleWithInternal.damageProcess.remainingDamagePoints !== 1 ||
    !isSupportedBattleResolutionEnvelope(battle) ||
    state.effectQueue.length > 0 ||
    state.deferredTriggers.length > 0 ||
    state.replacementState.length > 0 ||
    reifyCardRef(state, battle.attacker) === null ||
    reifyCardRef(state, battle.currentTarget) === null
  ) {
    return malformedContinuation(state);
  }
  return undefined;
};

const continueDamageAfterLifeTriggerResponse = (
  state: GameState,
  responseResult: EngineResult,
): EngineResult => {
  if (responseResult.errors !== undefined) {
    return responseResult;
  }
  if (state.battle === undefined) {
    const releasedState = releaseDamageDeferredEffectQueue(
      responseResult.state,
    );
    if (releasedState === null) {
      return malformedContinuation(state);
    }
    if (releasedState.effectQueue.length > 0) {
      const resolved = processEffectRuntime(releasedState);
      if (resolved.errors !== undefined) {
        return toEngineResult(state, [], toErrorTuple(resolved.errors));
      }
      return toEngineResult(resolved.state, [
        ...responseResult.events,
        ...resolved.events,
      ]);
    }
    return responseResult;
  }
  if (damageContinuationResolver === undefined) {
    return malformedContinuation(state);
  }
  const continued = damageContinuationResolver(responseResult.state);
  if (continued.errors !== undefined) {
    return malformedContinuation(state);
  }
  return toEngineResult(continued.state, [
    ...responseResult.events,
    ...continued.events,
  ]);
};

const applyActivatedTriggerResponse = (
  state: GameState,
  decision: ConfirmLifeTriggerDecision,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult => {
  const validation = validateDecisionCard(state, decision);
  if (validation !== undefined) {
    return validation;
  }
  const supported = resolveSupportedLifeTriggerEffect(state, {
    cardId: decision.card.cardId,
    instanceId: decision.card.instanceId,
    playerId: decision.card.playerId,
  });
  if (supported === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        `Life Trigger card ${String(
          decision.card.cardId,
        )} is unsupported for activation.`,
      ),
    );
  }
  if (
    supported.effects.some(
      (effect) => effect.sourcePresencePolicy === undefined,
    )
  ) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        `Life Trigger card ${String(
          decision.card.cardId,
        )} is unsupported for activation.`,
      ),
    );
  }

  const noZone = {
    zone: "noZone" as const,
    playerId: decision.playerId,
    slot: "temporary" as const,
  };
  const source: CardRef = {
    instanceId: decision.card.instanceId,
    cardId: decision.card.cardId,
    playerId: decision.playerId,
    zone: noZone,
  };
  const revealId = `reveal:life-trigger:${String(
    decision.card.instanceId,
  )}:${String(state.seq + 1)}`;
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: action.response.type,
    },
    { type: "private", playerId: decision.playerId },
  );
  appendEvent(
    state,
    events,
    "cardRevealed",
    {
      revealId,
      cards: [source],
      origin: "lifeDamage",
      reason: "lifeTriggerActivated",
    },
    { type: "public" },
  );
  const queueEntries: EffectQueueEntry[] = [];
  for (const effect of supported.effects) {
    const sourcePresencePolicy = effect.sourcePresencePolicy;
    if (sourcePresencePolicy === undefined) {
      return toEngineResult(
        state,
        [],
        invalidDecision(
          `Life Trigger card ${String(
            decision.card.cardId,
          )} is unsupported for activation.`,
        ),
      );
    }
    appendEvent(
      state,
      events,
      "triggerActivated",
      {
        playerId: decision.playerId,
        card: source,
        revealId,
        effectBlockId: effect.id,
      },
      { type: "public" },
    );
    const triggerEvent = events[events.length - 1];
    const triggerEventId = triggerEvent?.id;
    const triggerEventSeq = triggerEvent?.seq ?? state.eventJournal.length + 1;
    const queueEntry: EffectQueueEntry = {
      id: `queue-entry:life-trigger:${String(decision.id)}:${String(
        effect.id,
      )}` as EffectQueueEntry["id"],
      state: "pending",
      timingWindowId: `timing-window:life-trigger:${String(
        decision.id,
      )}` as EffectQueueEntry["timingWindowId"],
      generation: 0,
      controllerId: decision.playerId,
      source,
      sourceSnapshot: toSourceSnapshot(source, supported.resolved),
      ...(triggerEventId !== undefined ? { triggerEventId } : {}),
      effectBlockId: effect.id,
      orderingGroup:
        decision.playerId === state.turn.turnPlayerId
          ? "turnPlayer"
          : "nonTurnPlayer",
      createdAtEventSeq: triggerEventSeq,
      queuedAtStateSeq: toStateSeq(state.seq + 1),
      sourcePresencePolicy,
      causedBy: { type: "decision", decisionId: decision.id },
      ...effectQueueEntryPresentationForEffectBlock({
        effectBlock: effect,
        resolvedCard: supported.resolved,
        source,
      }),
    };
    appendEvent(
      state,
      events,
      "effectQueued",
      {
        queueEntryId: queueEntry.id,
        timingWindowId: queueEntry.timingWindowId,
        generation: queueEntry.generation,
        effectBlockId: queueEntry.effectBlockId,
        triggerEventId: queueEntry.triggerEventId,
        sourcePresencePolicy: queueEntry.sourcePresencePolicy,
        orderingGroup: queueEntry.orderingGroup,
      },
      { type: "public" },
    );
    queueEntries.push(queueEntry);
  }

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    effectQueue: [...state.effectQueue, ...queueEntries],
    revealedCards: [
      ...state.revealedCards,
      {
        id: revealId,
        cards: [source],
        visibility: { type: "public" },
        origin: "lifeDamage",
        createdAtStateSeq: toStateSeq(state.seq + 1),
        cleanupPolicy: "trashAfterResolution",
      },
    ],
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  assertGameStateInvariants(nextState);
  const resolved = processEffectRuntime(nextState);
  if (resolved.errors !== undefined) {
    return toEngineResult(state, [], toErrorTuple(resolved.errors));
  }
  return continueRuntimeAfterDecisionResult(
    state,
    toEngineResult(resolved.state, [...events, ...resolved.events]),
  );
};

export const applyLifeTriggerDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "confirmLifeTrigger") {
    return null;
  }
  if (action.response.type !== "lifeTrigger") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Response type must be lifeTrigger for confirmLifeTrigger.",
      ),
    );
  }
  const choice: string = action.response.choice;
  if (!isLifeTriggerChoiceAvailable(decision, choice)) {
    return getUnavailableLifeTriggerChoiceError(state);
  }
  if (choice === "activateTrigger") {
    const continuationValidation = validateDamageContinuation(state);
    if (continuationValidation !== undefined) {
      return continuationValidation;
    }
    return continueDamageAfterLifeTriggerResponse(
      state,
      applyActivatedTriggerResponse(state, decision, action),
    );
  }
  if (choice !== "addToHand") {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger choice is unsupported."),
    );
  }
  const continuationValidation = validateDamageContinuation(state);
  if (continuationValidation !== undefined) {
    return continuationValidation;
  }
  const validation = validateDecisionCard(state, decision);
  if (validation !== undefined) {
    return validation;
  }
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger decision player is missing."),
    );
  }

  const movedCard: CardInstance = {
    instanceId: decision.card.instanceId,
    cardId: decision.card.cardId,
    owner: decision.playerId,
    controller: decision.playerId,
    attachedDon: [],
    zone: {
      zone: "hand",
      playerId: decision.playerId,
      slot: "hand",
      index: 0,
    },
  };
  const nextHand = addCardsToHand(player.hand, [movedCard], decision.playerId);
  const handCard = nextHand[nextHand.length - 1] ?? movedCard;
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: action.response.type,
    },
    { type: "private", playerId: decision.playerId },
  );
  appendEvent(
    state,
    events,
    "cardMoved",
    {
      from: { zone: "life", playerId: decision.playerId, slot: "life" },
      to: handCard.zone,
      reason: "battleDamage",
    },
    { type: "public" },
  );
  appendEvent(
    state,
    events,
    "cardMoved",
    {
      instanceId: movedCard.instanceId,
      cardId: movedCard.cardId,
      from: { zone: "life", playerId: decision.playerId, slot: "life" },
      to: handCard.zone,
      reason: "lifeTriggerDeclined",
    },
    { type: "private", playerId: decision.playerId },
  );

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [decision.playerId]: {
        ...player,
        hand: nextHand,
      },
    },
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  assertGameStateInvariants(nextState);
  return continueDamageAfterLifeTriggerResponse(
    state,
    toEngineResult(nextState, events),
  );
};
