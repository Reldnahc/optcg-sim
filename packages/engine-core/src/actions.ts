import type {
  Action,
  CardRef,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  OrderCardsDecision,
  PlayerId,
  ReplacementProcess,
  ReplacementProcessState,
} from "@optcg/types";

import {
  appendEffectResolvedEvent,
  appendEvent,
  illegalAction,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { isMatchActive, reindexZoneCards, zonesEqual } from "./action-state.js";
import {
  applyBattleDecisionResponse,
  continueAttackTimingDecisionResultIfReady,
  applyDeclareAttack,
  applyUseCounter,
  finalizeBattleAfterReplacementResolution,
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
import {
  applySelectTargetsDecisionResponse,
  getSelectTargetsLegalActions,
} from "./target-selection-actions.js";
import {
  detectPendingRuntimeWork,
  executeAcceptedSelectedTargetKoReplacementProcess,
  finalizeSelectedTargetEffectResolution,
  resumePlaySourceOverflowDecision,
} from "./effect-runtime.js";
import { continueRuntimeAfterDecisionResult } from "./effect-runtime-decision-continuation.js";
import {
  resumeSequenceFrameAfterPlaySelectedOverflow,
  resumeSequenceFrameAfterReplacement,
} from "./effect-runtime-sequence-frames.js";
import { hasSequenceFrameForDecision } from "./effect-runtime-sequence-frame-decisions.js";
import { executeUnreplacedSelectedTargetKoProcess } from "./effect-runtime-primitives.js";
import {
  applyLifeTriggerDecisionResponse,
  getLifeTriggerLegalActions,
} from "./life-trigger-actions.js";
import {
  applyOptionalActivationDecisionResponse,
  getOptionalActivationLegalActions,
} from "./optional-activation-actions.js";
import { applySupportedSearchRevealChoiceResponse } from "./effect-runtime-search-reveal.js";
import {
  applySearchRevealSequenceChoiceResponse,
  applySequenceSelectCardsChoiceResponse,
  applyTopDeckPlacementSequenceAwareResponse,
  resumeSequenceAfterSearchRevealOrderResponse,
} from "./search-reveal-sequence-actions.js";
import {
  applySupportedTrashFromHandChoiceResponse,
  getTrashFromHandDecisionLegalActions,
  isTrashFromHandSelectCardsDecision,
} from "./effect-runtime-trash-from-hand.js";
import {
  applySupportedHandSelectionChoiceResponse,
  getHandSelectionDecisionLegalActions,
  isHandSelectionSelectCardsDecision,
} from "./effect-runtime-hand-selection.js";
import { applyChooseTriggerOrderDecisionResponse } from "./trigger-order-actions.js";
import {
  applyConcede,
  applyEndMainPhase,
  getTurnLegalActions,
} from "./turn-actions.js";
import {
  applyActivateMainAction,
  getActivateMainLegalActions,
} from "./effect-runtime-activation-main.js";
import { finalizeSetupFromContinuation } from "./initial-state.js";
import {
  applyStartOfGameSetupDecisionResponse,
  isStartOfGameSetupDecision,
} from "./start-of-game-effects.js";
import {
  applyChooseQuantityDecisionResponse,
  getChooseQuantityLegalActions,
} from "./choose-quantity-actions.js";
import {
  getRespondingPlayerId,
  hasMalformedRespondToDecisionPlayerId,
} from "./respond-to-decision-player.js";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const isCardRef = (value: unknown): value is CardRef => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const zone = candidate["zone"];
  return (
    typeof candidate["instanceId"] === "string" &&
    typeof candidate["cardId"] === "string" &&
    typeof candidate["playerId"] === "string" &&
    (zone === undefined || (typeof zone === "object" && zone !== null))
  );
};

const effectIdFromStoredReplacementPayload = (
  payload: unknown,
  fallback: string,
): string => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "effectId" in payload &&
    typeof payload.effectId === "string"
  ) {
    return payload.effectId;
  }
  return fallback;
};

const queueEntryIdFromStoredReplacementPayload = (
  payload: unknown,
): string | undefined => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "queueEntryId" in payload &&
    typeof payload.queueEntryId === "string"
  ) {
    return payload.queueEntryId;
  }
  return undefined;
};

const hasBattleKoReplacementContinuation = (payload: unknown): boolean => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("battleContinuation" in payload)
  ) {
    return false;
  }
  const continuation = payload.battleContinuation;
  return (
    typeof continuation === "object" &&
    continuation !== null &&
    "type" in continuation &&
    continuation.type === "endBattleAfterCharacterKoAttempt"
  );
};

const replacementProcessFromState = (
  decision: Extract<
    NonNullable<GameState["pendingDecision"]>,
    { type: "chooseReplacement" }
  >,
  processState: ReplacementProcessState,
): ReplacementProcess | null => {
  const payload = processState.payload;
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const source = "source" in payload ? payload.source : undefined;
  const target = "target" in payload ? payload.target : undefined;
  if (source !== undefined && !isCardRef(source)) {
    return null;
  }
  if (target !== undefined && !isCardRef(target)) {
    return null;
  }
  return {
    id: processState.processId,
    type: processState.type,
    ...(source === undefined ? {} : { source }),
    ...(target === undefined ? {} : { target }),
    payload,
    causedBy: decision.causedBy,
    usedReplacementIds: [...processState.usedReplacementIds],
  };
};

const getChooseReplacementLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "chooseReplacement" ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  return [
    ...(decision.mandatory
      ? []
      : [
          {
            type: "respondToDecision" as const,
            decisionId: decision.id,
            response: { type: "replacement" as const },
          },
        ]),
    ...decision.replacementIds.map(
      (replacementId): LegalAction => ({
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "replacement", replacementId },
      }),
    ),
  ];
};

const getSearchRevealDecisionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision !== undefined &&
    isSearchRevealOrderCardsDecision(decision) &&
    decision.playerId === playerId
  ) {
    return [
      {
        type: "respondToDecision",
        decisionId: decision.id,
        response: {
          type: "orderedIds",
          ids: decision.cards.map((card) => String(card.instanceId)),
        },
      },
    ];
  }
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    decision.playerId !== playerId ||
    decision.request.set === undefined ||
    !String(decision.request.set).startsWith("set:search-reveal:")
  ) {
    return [];
  }

  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    },
    ...decision.candidates.map(
      (candidate): LegalAction => ({
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "cards", cards: [candidate.card] },
      }),
    ),
  ];
};

const searchRevealOrderPrefix = "decision:orderCards:search-reveal:";

const isSearchRevealOrderCardsDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is OrderCardsDecision =>
  decision.type === "orderCards" &&
  String(decision.id).startsWith(searchRevealOrderPrefix);

const hasDuplicateIds = (ids: readonly string[]): boolean =>
  ids.some((id, index) => ids.slice(index + 1).includes(id));

const applySearchRevealOrderResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || !isSearchRevealOrderCardsDecision(decision)) {
    return null;
  }
  const fail = (reason: string): EngineResult =>
    toEngineResult(state, [], invalidDecision(reason));
  if (action.response.type !== "orderedIds") {
    return fail("Response type must be orderedIds for search reveal order.");
  }
  const responseIds = (action.response as { ids?: unknown }).ids;
  const expectedIds = decision.cards.map((card) => String(card.instanceId));
  if (
    !Array.isArray(responseIds) ||
    !responseIds.every((id) => typeof id === "string") ||
    hasDuplicateIds(responseIds) ||
    responseIds.length !== expectedIds.length ||
    !responseIds.every((id) => expectedIds.includes(id))
  ) {
    return fail("Ordered ids must match the remaining search cards.");
  }
  const player = state.players[decision.playerId];
  if (player === undefined)
    return fail("Search reveal order player is missing.");
  const activeDeckCards = player.deck.slice(0, decision.cards.length);
  if (
    activeDeckCards.length !== decision.cards.length ||
    !decision.cards.every((card, index) => {
      const deckCard = activeDeckCards[index];
      return (
        deckCard !== undefined &&
        card.instanceId === deckCard.instanceId &&
        card.cardId === deckCard.cardId &&
        card.zone !== undefined &&
        zonesEqual(card.zone, deckCard.zone)
      );
    })
  ) {
    return fail("Search reveal order cards are stale or unsupported.");
  }
  const orderedCards = responseIds.flatMap((id) => {
    const card = activeDeckCards.find(
      (candidate) => String(candidate.instanceId) === id,
    );
    return card === undefined ? [] : [card];
  });
  const causedBy = decision.causedBy;
  const queuedEntry =
    causedBy.type === "effect"
      ? state.effectQueue.find(
          (entry) =>
            entry.id === causedBy.queueEntryId &&
            entry.effectBlockId === causedBy.effectId,
        )
      : undefined;
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
      orderedCount: responseIds.length,
    },
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }
  const shouldResumeSequence = hasSequenceFrameForDecision(state, decision.id);
  if (queuedEntry !== undefined && !shouldResumeSequence) {
    appendEffectResolvedEvent(state, events, queuedEntry);
  }
  const finalDeck = reindexZoneCards(
    [...player.deck.slice(decision.cards.length), ...orderedCards],
    "deck",
    decision.playerId,
    "deck",
  );
  const queueEntryId = String(decision.id).slice(
    searchRevealOrderPrefix.length,
  );
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [decision.playerId]: { ...player, deck: finalDeck },
    },
    effectQueue:
      queuedEntry === undefined || shouldResumeSequence
        ? state.effectQueue
        : state.effectQueue.filter((entry) => entry.id !== queuedEntry.id),
    revealedCards: state.revealedCards.filter(
      (record) => record.id !== `reveal:search-reveal:${queueEntryId}`,
    ),
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  return toEngineResult(nextState, events);
};

const getSetupStartOfGameLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const pending = state.pendingDecision;
  if (
    state.status.type !== "setup" ||
    pending === undefined ||
    !isStartOfGameSetupDecision(pending)
  ) {
    return [];
  }
  const decision = pending;
  if (decision.playerId !== playerId) return [];
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

const applyChooseReplacementDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "chooseReplacement") {
    return null;
  }
  if (hasMalformedRespondToDecisionPlayerId(action)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Player does not match current pending decision."),
    );
  }
  if (getRespondingPlayerId(action, decision.playerId) !== decision.playerId) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Player does not match current pending decision."),
    );
  }

  const response: unknown = action.response;
  if (typeof response !== "object" || response === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response must be an object for chooseReplacement."),
    );
  }
  const responseType = (response as { type?: unknown }).type;
  if (responseType !== "replacement") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Response type must be replacement for chooseReplacement.",
      ),
    );
  }

  const replacementId = (response as { replacementId?: unknown }).replacementId;
  if (replacementId !== undefined && typeof replacementId !== "string") {
    return toEngineResult(
      state,
      [],
      invalidDecision("replacementId must be a string."),
    );
  }
  if (replacementId !== undefined) {
    if (!decision.replacementIds.includes(replacementId)) {
      return toEngineResult(
        state,
        [],
        invalidDecision("replacementId must match an available replacement."),
      );
    }
  }
  if (decision.mandatory && replacementId === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Mandatory replacement decisions cannot be declined."),
    );
  }

  const storedProcess = state.replacementState.find(
    (processState) => processState.processId === decision.processId,
  );
  if (storedProcess === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "chooseReplacement decision is stale for current replacement process.",
      ),
    );
  }
  const process = replacementProcessFromState(decision, storedProcess);
  if (process === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "chooseReplacement decision is stale for current replacement process.",
      ),
    );
  }

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
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }

  const processState: GameState = {
    ...state,
    replacementState: state.replacementState.filter(
      (candidate) => candidate.processId !== decision.processId,
    ),
  };
  delete processState.pendingDecision;
  const queuedEntryId = queueEntryIdFromStoredReplacementPayload(
    storedProcess.payload,
  );
  const queuedEntry =
    queuedEntryId === undefined
      ? undefined
      : state.effectQueue.find((entry) => entry.id === queuedEntryId);
  const shouldResumeSequence = hasSequenceFrameForDecision(state, decision.id);
  const shouldFinalizeBattle =
    queuedEntry === undefined &&
    hasBattleKoReplacementContinuation(storedProcess.payload);

  if (replacementId !== undefined) {
    const applied = executeAcceptedSelectedTargetKoReplacementProcess(
      processState,
      events,
      effectIdFromStoredReplacementPayload(storedProcess.payload, decision.id),
      process,
      replacementId,
    );
    if ("error" in applied) {
      return toEngineResult(state, [], [applied.error]);
    }
    const nextState = {
      ...applied.state,
      actionSeq: state.actionSeq + 1,
    };
    if (shouldFinalizeBattle) {
      return finalizeBattleAfterReplacementResolution(state, nextState, events);
    }
    return queuedEntry === undefined
      ? toEngineResult(nextState, events)
      : shouldResumeSequence
        ? toEngineResult(nextState, events)
        : finalizeSelectedTargetEffectResolution(
            nextState,
            state,
            queuedEntry,
            events,
            events.slice(1),
          );
  }

  const unreplaced = executeUnreplacedSelectedTargetKoProcess(
    processState,
    events,
    effectIdFromStoredReplacementPayload(storedProcess.payload, decision.id),
    process,
  );
  if ("error" in unreplaced) {
    return toEngineResult(state, [], [unreplaced.error]);
  }

  const nextState: GameState = {
    ...unreplaced.state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  if (shouldFinalizeBattle) {
    return finalizeBattleAfterReplacementResolution(state, nextState, events);
  }
  return queuedEntry === undefined
    ? toEngineResult(nextState, events)
    : shouldResumeSequence
      ? toEngineResult(nextState, events)
      : finalizeSelectedTargetEffectResolution(
          nextState,
          state,
          queuedEntry,
          events,
          events.slice(1),
        );
};

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
    if (
      state.pendingDecision.type === "chooseTriggerOrder" &&
      state.pendingDecision.playerId === playerId
    ) {
      actions.push({
        type: "respondToDecision",
        decisionId: state.pendingDecision.id,
        response: {
          type: "orderedIds",
          ids: state.pendingDecision.triggerIds.slice(0, 1),
        },
      });
    }
    actions.push(...getLifeTriggerLegalActions(state, playerId));
    actions.push(...getSelectTargetsLegalActions(state, playerId));
    actions.push(...getOptionalActivationLegalActions(state, playerId));
    actions.push(...getPlayCardLegalActions(state, playerId));
    actions.push(...getBattleDecisionLegalActions(state, playerId));
    actions.push(...getChooseReplacementLegalActions(state, playerId));
    actions.push(...getChooseQuantityLegalActions(state, playerId));
    actions.push(...getSearchRevealDecisionLegalActions(state, playerId));
    actions.push(...getTrashFromHandDecisionLegalActions(state, playerId));
    actions.push(...getHandSelectionDecisionLegalActions(state, playerId));
    actions.push(...getSetupStartOfGameLegalActions(state, playerId));
    return actions;
  }

  actions.push(...getTurnLegalActions(state, playerId));
  actions.push(...getAttachDonLegalActions(state, playerId));
  actions.push(...getPlayCardLegalActions(state, playerId));
  actions.push(...getDeclareAttackLegalActions(state, playerId));
  actions.push(...getActivateMainLegalActions(state, playerId));
  return actions;
};

const continueRuntimeAndAttackTimingAfterDecision = (
  originalState: GameState,
  result: EngineResult,
): EngineResult =>
  continueAttackTimingDecisionResultIfReady(
    continueRuntimeAfterDecisionResult(originalState, result),
  );

const shouldContinueRuntimeAfterEffectDecision = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]>,
): boolean => {
  const causedBy = decision.causedBy;
  if (causedBy.type !== "effect") {
    return false;
  }
  const queueEntry = state.effectQueue.find(
    (entry) => entry.id === causedBy.queueEntryId,
  );
  return (
    queueEntry?.causedBy.type === "ruleProcess" &&
    (queueEntry.causedBy.name === "effectRuntime:mainEventTriggerQueueing" ||
      queueEntry.causedBy.name ===
        "effectRuntime:opponentActivationTriggerQueueing")
  );
};

const continueAfterEffectDecision = (
  originalState: GameState,
  decision: NonNullable<GameState["pendingDecision"]>,
  result: EngineResult,
): EngineResult =>
  shouldContinueRuntimeAfterEffectDecision(originalState, decision)
    ? continueRuntimeAndAttackTimingAfterDecision(originalState, result)
    : continueAttackTimingDecisionResultIfReady(result);

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
  if (hasMalformedRespondToDecisionPlayerId(action)) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "Player does not match current pending decision.",
        },
      ],
    );
  }
  if (getRespondingPlayerId(action, decision.playerId) !== decision.playerId) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "Player does not match current pending decision.",
        },
      ],
    );
  }

  const playCardResult = applyPlayCardDecisionResponse(state, action);
  if (playCardResult !== null) {
    if (
      decision.type === "selectCards" &&
      playCardResult.errors === undefined &&
      playCardResult.state.pendingDecision === undefined
    ) {
      const resumedPlaySource = resumePlaySourceOverflowDecision(
        state,
        decision,
        playCardResult,
      );
      if (resumedPlaySource !== undefined) {
        return continueRuntimeAndAttackTimingAfterDecision(
          state,
          resumedPlaySource,
        );
      }
    }
    if (
      decision.type === "selectCards" &&
      playCardResult.errors === undefined &&
      playCardResult.state.pendingDecision === undefined
    ) {
      const resumed = resumeSequenceFrameAfterPlaySelectedOverflow(
        playCardResult.state,
        decision.id,
      );
      if (resumed !== undefined) {
        if (!resumed.ok) {
          return toEngineResult(state, [], [resumed.error]);
        }
        return continueRuntimeAndAttackTimingAfterDecision(
          state,
          toEngineResult(resumed.state, [
            ...playCardResult.events,
            ...resumed.events,
          ]),
        );
      }
    }
    return playCardResult;
  }
  if (isHandSelectionSelectCardsDecision(decision)) {
    const handSelection = applySupportedHandSelectionChoiceResponse(
      state,
      action,
    );
    if (handSelection !== null) {
      return continueRuntimeAndAttackTimingAfterDecision(state, handSelection);
    }
  }
  const battleResult = applyBattleDecisionResponse(state, action);
  if (battleResult !== null) {
    return battleResult.errors === undefined &&
      battleResult.state.battle?.step === "counter" &&
      battleResult.state.pendingDecision === undefined
      ? continueRuntimeAndAttackTimingAfterDecision(state, battleResult)
      : battleResult;
  }
  const lifeTriggerResult = applyLifeTriggerDecisionResponse(state, action);
  if (lifeTriggerResult !== null) {
    return lifeTriggerResult;
  }
  const optionalActivationResult = applyOptionalActivationDecisionResponse(
    state,
    action,
  );
  if (optionalActivationResult !== null) {
    return continueAfterEffectDecision(
      state,
      decision,
      optionalActivationResult,
    );
  }
  const triggerOrderResult = applyChooseTriggerOrderDecisionResponse(
    state,
    action,
  );
  if (triggerOrderResult !== null) {
    return continueAfterEffectDecision(state, decision, triggerOrderResult);
  }
  const targetSelectionResult = applySelectTargetsDecisionResponse(
    state,
    action,
  );
  if (targetSelectionResult !== null) {
    return continueAfterEffectDecision(state, decision, targetSelectionResult);
  }
  if (
    decision.type === "selectCards" &&
    decision.request.set !== undefined &&
    String(decision.request.set).startsWith("set:search-reveal:")
  ) {
    const sequenceSearchResult = applySearchRevealSequenceChoiceResponse(
      state,
      action,
    );
    if (sequenceSearchResult !== null) {
      return continueRuntimeAndAttackTimingAfterDecision(
        state,
        sequenceSearchResult,
      );
    }
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      applySupportedSearchRevealChoiceResponse(state, action),
    );
  }
  const sequenceSelectCards = applySequenceSelectCardsChoiceResponse(
    state,
    action,
  );
  if (sequenceSelectCards !== null) {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      sequenceSelectCards,
    );
  }
  const searchRevealOrderResult = applySearchRevealOrderResponse(state, action);
  if (searchRevealOrderResult !== null) {
    const sequenceOrderResult = resumeSequenceAfterSearchRevealOrderResponse(
      state,
      searchRevealOrderResult,
    );
    if (sequenceOrderResult !== null) {
      return continueRuntimeAndAttackTimingAfterDecision(
        state,
        sequenceOrderResult,
      );
    }
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      searchRevealOrderResult,
    );
  }
  const topDeckPlacementResult = applyTopDeckPlacementSequenceAwareResponse(
    state,
    action,
  );
  if (topDeckPlacementResult !== null) {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      topDeckPlacementResult,
    );
  }
  if (isTrashFromHandSelectCardsDecision(decision)) {
    const trashResult = applySupportedTrashFromHandChoiceResponse(
      state,
      action,
    );
    if (!trashResult.ok) {
      return trashResult.result;
    }
    const finalized = finalizeSelectedTargetEffectResolution(
      trashResult.state,
      trashResult.eventBaseState,
      trashResult.entry,
      trashResult.allEvents,
      trashResult.resolutionEvents,
    );
    return continueAfterEffectDecision(state, decision, finalized);
  }
  const setupStartOfGame = applyStartOfGameSetupDecisionResponse(state, action);
  if (setupStartOfGame !== null) {
    if (setupStartOfGame.errors !== undefined) {
      return toEngineResult(state, [], setupStartOfGame.errors);
    }
    if (setupStartOfGame.shouldFinalizeSetup) {
      const finalized = finalizeSetupFromContinuation(setupStartOfGame.state);
      return toEngineResult(finalized, setupStartOfGame.events);
    }
    return toEngineResult(setupStartOfGame.state, setupStartOfGame.events);
  }
  const replacementResult = applyChooseReplacementDecisionResponse(
    state,
    action,
  );
  if (replacementResult !== null) {
    if (
      replacementResult.errors === undefined &&
      replacementResult.state.pendingDecision === undefined
    ) {
      const resumed = resumeSequenceFrameAfterReplacement(
        replacementResult.state,
        decision.id,
      );
      if (resumed !== undefined) {
        if (!resumed.ok) {
          return toEngineResult(state, [], [resumed.error]);
        }
        return continueRuntimeAndAttackTimingAfterDecision(
          state,
          toEngineResult(resumed.state, [
            ...replacementResult.events,
            ...resumed.events,
          ]),
        );
      }
    }
    return continueAfterEffectDecision(state, decision, replacementResult);
  }
  const chooseQuantityResult = applyChooseQuantityDecisionResponse(
    state,
    action,
  );
  if (chooseQuantityResult !== null) {
    return continueAfterEffectDecision(state, decision, chooseQuantityResult);
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
  if (action.type === "useCounter") {
    return continueRuntimeAndAttackTimingAfterDecision(
      state,
      applyUseCounter(state, action),
    );
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
  if (action.type === "activateEffect") {
    return applyActivateMainAction(state, action);
  }
  return illegalAction(state, `Unsupported action type: ${action.type}`);
};
