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
  appendEffectQueuedEvent,
  appendEvent,
  assertGameStateInvariantsIfEnabled,
  type EngineResultOptions,
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
import { evaluateEffectBlockRuntimeSupport } from "../effect-runtime-admission.js";
import { evaluateQueuedEffectCondition } from "../effect-runtime-conditions.js";
import { continueRuntimeAfterDecisionResult } from "../effect-runtime-decision-continuation.js";
import { effectQueueEntryPresentationForEffectBlock } from "../runtime/effect-presentation.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import {
  applyLifeRuleDeckBottomReplacement,
  findLifeRuleAddToHandReplacement,
} from "./life-rule-replacement.js";
import { lifeTriggerQueueOrigin } from "./queue-origin.js";

export const hasLifeTriggerText = (triggerText: string | undefined): boolean =>
  triggerText !== undefined && triggerText.trim().length > 0;

type DamageContinuationResolver = (state: GameState) => EngineResult;

let damageContinuationResolver: DamageContinuationResolver | undefined;

export const registerLifeTriggerDamageContinuationResolver = (
  resolver: DamageContinuationResolver,
): void => {
  damageContinuationResolver = resolver;
};

const isSupportedTriggerEffect = (
  effect: EffectBlock,
  siblingBlocks: readonly EffectBlock[],
): boolean => {
  if (effect.category !== "auto") return false;
  if (effect.trigger.type !== "trigger") return false;
  if (
    effect.sourcePresencePolicy !== "resolveFromLastKnownInformation" &&
    effect.sourcePresencePolicy !== "noSourceRequired"
  ) {
    return false;
  }
  return evaluateEffectBlockRuntimeSupport(effect, { siblingBlocks }).supported;
};

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
      (effect) => !isSupportedTriggerEffect(effect, triggerEffects),
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
  sourceLifeFaceUp = false,
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
    ...(sourceLifeFaceUp ? { sourceLifeFaceUp } : {}),
  };
};

const getAddToHandOnlyLifeTriggerDecision = (
  state: GameState,
  damagedPlayerId: PlayerId,
  card: CardInstance,
  sourceLifeFaceUp = false,
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
  ...(sourceLifeFaceUp ? { sourceLifeFaceUp } : {}),
});

export const getLifeDamageDecision = (
  state: GameState,
  damagedPlayerId: PlayerId,
  card: CardInstance,
  sourceLifeFaceUp = false,
): ConfirmLifeTriggerDecision | undefined => {
  const resolved = state.cardManifest.cards[card.cardId];
  if (resolved === undefined) {
    return undefined;
  }
  if (hasLifeTriggerText(resolved.triggerText)) {
    return (
      getSupportedLifeTriggerDecision(
        state,
        damagedPlayerId,
        card,
        sourceLifeFaceUp,
      ) ??
      getAddToHandOnlyLifeTriggerDecision(
        state,
        damagedPlayerId,
        card,
        sourceLifeFaceUp,
      )
    );
  }
  return getAddToHandOnlyLifeTriggerDecision(
    state,
    damagedPlayerId,
    card,
    sourceLifeFaceUp,
  );
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
  options: EngineResultOptions = {},
): EngineResult | undefined => {
  if (decision.card.playerId !== decision.playerId) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger card player does not match decision."),
      options,
    );
  }
  if (state.cardManifest.cards[decision.card.cardId] === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger card metadata is missing."),
      options,
    );
  }
  if (isCardInNormalZone(state, decision.card.instanceId)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger card is stale for current state."),
      options,
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

const getUnavailableLifeTriggerChoiceError = (
  state: GameState,
  options: EngineResultOptions,
): EngineResult =>
  toEngineResult(
    state,
    [],
    invalidDecision("Life Trigger choice is not available."),
    options,
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

const malformedContinuation = (
  state: GameState,
  options: EngineResultOptions = {},
): EngineResult =>
  toEngineResult(
    state,
    [],
    invalidDecision("Life Trigger damage continuation is malformed."),
    options,
  );

const validateDamageContinuation = (
  state: GameState,
  options: EngineResultOptions,
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
    return malformedContinuation(state, options);
  }
  return undefined;
};

const continueDamageAfterLifeTriggerResponse = (
  state: GameState,
  responseResult: EngineResult,
  options: EngineResultOptions,
): EngineResult => {
  if (responseResult.errors !== undefined) {
    return responseResult;
  }
  if (state.battle === undefined) {
    const decisionId = state.pendingDecision?.id;
    if (
      decisionId !== undefined &&
      state.effectExecutionFrames.some(
        (frame) => frame.pendingDecision.decisionId === decisionId,
      )
    ) {
      return responseResult;
    }
    const releasedState = releaseDamageDeferredEffectQueue(
      responseResult.state,
    );
    if (releasedState === null) {
      return malformedContinuation(state, options);
    }
    if (releasedState.effectQueue.length > 0) {
      const resolved = processEffectRuntime(releasedState);
      if (resolved.errors !== undefined) {
        return toEngineResult(
          state,
          [],
          toErrorTuple(resolved.errors),
          options,
        );
      }
      return toEngineResult(
        resolved.state,
        [...responseResult.events, ...resolved.events],
        undefined,
        options,
      );
    }
    return responseResult;
  }
  if (damageContinuationResolver === undefined) {
    return malformedContinuation(state, options);
  }
  const continued = damageContinuationResolver(responseResult.state);
  if (continued.errors !== undefined) {
    return malformedContinuation(state, options);
  }
  return toEngineResult(
    continued.state,
    [...responseResult.events, ...continued.events],
    undefined,
    options,
  );
};

const applyActivatedTriggerResponse = (
  state: GameState,
  decision: ConfirmLifeTriggerDecision,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: EngineResultOptions,
): EngineResult => {
  const validation = validateDecisionCard(state, decision, options);
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
      options,
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
      options,
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
        options,
      );
    }
    appendEvent(
      state,
      events,
      "triggerActivated",
      {
        playerId: decision.playerId,
        source,
        card: source,
        sourceCardId: source.cardId,
        sourceTypes: supported.resolved.types,
        sourceCategory: supported.resolved.category,
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
      queueOrigin: lifeTriggerQueueOrigin,
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
    appendEffectQueuedEvent(
      state,
      events,
      queueEntry,
      effect,
      supported.resolved,
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
  assertGameStateInvariantsIfEnabled(nextState, options);
  const resolved = processEffectRuntime(nextState);
  if (resolved.errors !== undefined) {
    return toEngineResult(state, [], toErrorTuple(resolved.errors), options);
  }
  return continueRuntimeAfterDecisionResult(
    state,
    toEngineResult(
      resolved.state,
      [...events, ...resolved.events],
      undefined,
      options,
    ),
    options,
  );
};

export const applyLifeTriggerDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: EngineResultOptions = {},
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
      options,
    );
  }
  const choice: string = action.response.choice;
  if (!isLifeTriggerChoiceAvailable(decision, choice)) {
    return getUnavailableLifeTriggerChoiceError(state, options);
  }
  if (choice === "activateTrigger") {
    const continuationValidation = validateDamageContinuation(state, options);
    if (continuationValidation !== undefined) {
      return continuationValidation;
    }
    return continueDamageAfterLifeTriggerResponse(
      state,
      applyActivatedTriggerResponse(state, decision, action, options),
      options,
    );
  }
  if (choice !== "addToHand") {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger choice is unsupported."),
      options,
    );
  }
  const continuationValidation = validateDamageContinuation(state, options);
  if (continuationValidation !== undefined) {
    return continuationValidation;
  }
  const validation = validateDecisionCard(state, decision, options);
  if (validation !== undefined) {
    return validation;
  }
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger decision player is missing."),
      options,
    );
  }

  const baseMovedCard: CardInstance = {
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
  const lifeRuleReplacement = findLifeRuleAddToHandReplacement(
    state,
    decision.playerId,
    decision.sourceLifeFaceUp === true,
  );
  const replacedMove =
    lifeRuleReplacement === undefined
      ? undefined
      : applyLifeRuleDeckBottomReplacement(
          player.deck,
          baseMovedCard,
          decision.playerId,
        );
  const nextHand =
    replacedMove === undefined
      ? addCardsToHand(player.hand, [baseMovedCard], decision.playerId)
      : player.hand;
  const handCard = nextHand[nextHand.length - 1] ?? baseMovedCard;
  const destinationCard = replacedMove?.card ?? handCard;
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
  if (lifeRuleReplacement !== undefined && replacedMove !== undefined) {
    appendEvent(
      state,
      events,
      "replacementApplied",
      {
        processId: `life-rule:${String(decision.id)}`,
        replacementId: lifeRuleReplacement.record.id,
        previousPayloadHash: hashCanonicalStateValue({
          from: "life",
          to: "hand",
          card: decision.card,
          faceUp: true,
        }),
        transformedPayloadHash: hashCanonicalStateValue({
          from: "life",
          to: "deck",
          position: "bottom",
          card: decision.card,
        }),
      },
      { type: "public" },
    );
    const replacementEvent = events[events.length - 1];
    if (replacementEvent !== undefined) {
      replacementEvent.causedBy = {
        type: "replacement",
        replacementId: lifeRuleReplacement.record.id,
      };
    }
  }
  appendEvent(
    state,
    events,
    "cardMoved",
    {
      from: { zone: "life", playerId: decision.playerId, slot: "life" },
      to: destinationCard.zone,
      reason:
        replacedMove === undefined ? "battleDamage" : "lifeRuleReplacement",
    },
    { type: "public" },
  );
  appendEvent(
    state,
    events,
    "cardMoved",
    {
      instanceId: baseMovedCard.instanceId,
      cardId: baseMovedCard.cardId,
      from: { zone: "life", playerId: decision.playerId, slot: "life" },
      to: destinationCard.zone,
      reason:
        replacedMove === undefined
          ? "lifeTriggerDeclined"
          : "lifeRuleReplacement",
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
        ...(replacedMove === undefined ? {} : { deck: replacedMove.deck }),
      },
    },
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  assertGameStateInvariantsIfEnabled(nextState, options);
  return continueDamageAfterLifeTriggerResponse(
    state,
    toEngineResult(nextState, events, undefined, options),
    options,
  );
};
