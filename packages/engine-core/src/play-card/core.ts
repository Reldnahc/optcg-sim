import type {
  Action,
  CardInstance,
  CausalityRef,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PaymentSpec,
  PlayerId,
} from "@optcg/types";

import {
  appendEvent,
  createEvent,
  illegalAction,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import {
  isMatchActive,
  targetMatchesCard,
  zonesEqual,
} from "../actions/state.js";
import { assertGameStateInvariants } from "../state/invariants.js";
import {
  getPlayCardPendingDecisionLegalActions,
  parseCharacterOverflowDecisionInstanceId,
  getRuntimePlaySelectedOverflowDecisionId,
  getRuntimePlaySourceOverflowDecisionId,
  parseRuntimePlaySelectedOverflowDecisionInstanceId,
  parseRuntimePlaySourceOverflowDecisionInstanceId,
} from "./legal-actions.js";
import { findPlayCardOverflowSource } from "./overflow-source.js";
import {
  createPlayCardPaymentDecisionResult,
  getPlayCardPaymentContext,
  isPlayCardPaymentDecisionId,
  validatePlayCardPaymentSelection,
} from "./payment.js";
import {
  canResolveDestinationConflict,
  getActiveDonCount,
  getEffectivePlayCost,
  getPlayableHandCards,
  getSupportedPlayMetadata,
  isPlayBlockedByRestriction,
  type SupportedPlayMetadata,
} from "./support.js";
import { continueRuntimeUntilIdle } from "../effect-runtime-decision-continuation.js";
import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import { applyRuleProcessingCheckpoint } from "../rules/rule-processing.js";
import { findRuntimePlaySelectedOverflowEnterRested } from "../runtime-play-selected-overflow-entry-state.js";
import { placePlayedCardResult } from "./placement.js";

export const getPlayCardLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const actions: LegalAction[] = [];
  if (!isMatchActive(state) || state.players[playerId] === undefined) {
    return actions;
  }
  const player = state.players[playerId];
  if (state.pendingDecision !== undefined) {
    actions.push(...getPlayCardPendingDecisionLegalActions(state, playerId));
    return actions;
  }
  if (hasPendingRuntimeWork(state)) {
    return actions;
  }
  if (state.turn.phase !== "main" || state.turn.turnPlayerId !== playerId) {
    return actions;
  }
  if (state.battle !== undefined) {
    return actions;
  }
  for (const card of getPlayableHandCards(state, playerId)) {
    const supported = getSupportedPlayMetadata(state, card);
    const playCost =
      supported === null
        ? null
        : getEffectivePlayCost(state, playerId, card, supported);
    actions.push({
      type: "playCard",
      cardInstanceId: card.instanceId,
      ...(playCost === null
        ? {}
        : canonicalRestDonCostPayment(player.costArea, playCost)),
    });
  }
  return actions;
};

const canonicalRestDonCostPayment = (
  costArea: readonly CardInstance[],
  count: number,
): { costPayment: PaymentSpec } | Record<string, never> => {
  if (count <= 0) {
    return {};
  }
  return {
    costPayment: {
      optionId: "restDon",
      selectedDonInstanceIds: costArea
        .filter((card) => card.state === "active")
        .slice(0, count)
        .map((card) => card.instanceId),
    },
  };
};

export const applyPlayCard = (
  state: GameState,
  action: Extract<Action, { type: "playCard" }>,
): EngineResult => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "playCard is only legal while match is active.",
    );
  }
  if (state.turn.phase !== "main") {
    return illegalAction(state, "playCard requires main phase.");
  }
  if (state.battle !== undefined) {
    return illegalAction(state, "playCard is illegal during an active battle.");
  }
  if (hasPendingRuntimeWork(state)) {
    return illegalAction(state, "playCard requires no pending runtime work.");
  }

  const playerId = state.turn.turnPlayerId;
  const player = state.players[playerId];
  if (player === undefined) {
    return illegalAction(state, "Turn player does not exist.");
  }
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === action.cardInstanceId,
  );
  if (handIndex < 0) {
    return illegalAction(
      state,
      "playCard requires a card in turn player's hand.",
    );
  }
  const handCard = player.hand[handIndex];
  if (handCard === undefined) {
    return illegalAction(state, "playCard hand card not found.");
  }
  const supported = getSupportedPlayMetadata(state, handCard);
  if (supported === null) {
    return illegalAction(state, "playCard card is unsupported.");
  }
  if (isPlayBlockedByRestriction(state, playerId, handCard)) {
    return illegalAction(state, "playCard is blocked by a play restriction.");
  }
  const playCost = getEffectivePlayCost(state, playerId, handCard, supported);
  if (getActiveDonCount(player.costArea) < playCost) {
    return illegalAction(state, "playCard requires enough active DON!!.");
  }
  if (!canResolveDestinationConflict(player, supported.category)) {
    return illegalAction(state, "playCard destination conflict is invalid.");
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "cardRevealed",
    { playerId, instanceId: handCard.instanceId, cardId: handCard.cardId },
    { type: "public" },
  );

  if (playCost > 0) {
    if (action.costPayment !== undefined) {
      const payment = validatePlayCardPaymentSelection({
        state,
        response: { type: "payment", ...action.costPayment },
        player,
        supported,
        playCost,
      });
      if (!payment.ok) {
        return payment.result;
      }
      appendEvent(
        state,
        events,
        "costPaid",
        {
          playerId,
          optionId: "restDon",
          selectedDonInstanceIds: payment.selectedDonInstanceIds,
        },
        { type: "public" },
      );
      const paidPlayer = { ...player, costArea: payment.nextCostArea };
      return placePlayedCardResult({
        state,
        events,
        playerId,
        player: paidPlayer,
        sourceIndex: handIndex,
        sourceCard: handCard,
        supported,
        costArea: payment.nextCostArea,
        resolvePlayCardEffectRuntime,
      });
    }
    return createPlayCardPaymentDecisionResult({
      state,
      events,
      playerId,
      handCard,
      playCost,
    });
  }

  return placePlayedCardResult({
    state,
    events,
    playerId,
    player,
    sourceIndex: handIndex,
    sourceCard: handCard,
    supported,
    costArea: player.costArea,
    resolvePlayCardEffectRuntime,
  });
};

const hasPendingRuntimeWork = (state: GameState): boolean =>
  state.effectQueue.length > 0 || state.deferredTriggers.length > 0;

const shouldResolveOnPlayRuntime = (
  state: GameState,
  handCard: CardInstance,
  supported: SupportedPlayMetadata,
): boolean =>
  supported.category === "event" ||
  state.cardManifest.cards[handCard.cardId]?.support.status ===
    "implemented-dsl";

const resolvePlayCardEffectRuntime = (
  originalState: GameState,
  acceptedState: GameState,
  acceptedEvents: EngineEvent[],
  handCard: CardInstance,
  supported: SupportedPlayMetadata,
): EngineResult => {
  if (!shouldResolveOnPlayRuntime(acceptedState, handCard, supported)) {
    return toEngineResult(acceptedState, acceptedEvents);
  }

  const continued = continueRuntimeUntilIdle(
    originalState,
    toEngineResult(acceptedState, acceptedEvents),
  );
  if (continued.errors !== undefined) {
    return toEngineResult(originalState, [], toErrorTuple(continued.errors));
  }
  const stateWithJournal: GameState = {
    ...continued.state,
    eventJournal: [...originalState.eventJournal, ...continued.events],
  };
  assertGameStateInvariants(stateWithJournal);
  return toEngineResult(stateWithJournal, continued.events);
};

const toErrorTuple = (
  errors: readonly EngineError[],
): readonly [EngineError, ...EngineError[]] => {
  const first = errors[0];
  if (first === undefined) {
    return [
      {
        type: "effectRuntimeError",
        effectId: "play-card-effect-runtime",
        details: { reason: "empty-runtime-error-list" },
      },
    ];
  }
  return [first, ...errors.slice(1)];
};

export const applyPlayCardDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined) {
    return null;
  }
  if (decision.id !== action.decisionId) {
    return illegalAction(
      state,
      "Decision id does not match current pending decision.",
    );
  }
  if (
    decision.type === "selectCards" &&
    (parseCharacterOverflowDecisionInstanceId(decision.id) !== null ||
      parseRuntimePlaySelectedOverflowDecisionInstanceId(decision.id) !==
        null ||
      parseRuntimePlaySourceOverflowDecisionInstanceId(decision.id) !== null)
  ) {
    return applyCharacterOverflowResponse(state, action);
  }
  if (decision.type === "payCost" && isPlayCardPaymentDecisionId(decision.id)) {
    return applyPlayCardPaymentResponse(state, action);
  }
  return null;
};

export const applyRuntimePlaySelected = (params: {
  state: GameState;
  playerId: PlayerId;
  cardInstanceId: CardInstance["instanceId"];
  sourceZone: "hand" | "trash" | "deck";
  enterRested: boolean;
  ignoreCost: boolean;
  causedBy?: CausalityRef;
}): EngineResult => {
  const {
    state,
    playerId,
    cardInstanceId,
    sourceZone,
    enterRested,
    ignoreCost,
    causedBy,
  } = params;
  const player = state.players[playerId];
  if (player === undefined) {
    return illegalAction(state, "playSelected requires an existing player.");
  }
  const sourceCards =
    sourceZone === "hand"
      ? player.hand
      : sourceZone === "trash"
        ? player.trash
        : player.deck;
  const sourceIndex = sourceCards.findIndex(
    (card) => card.instanceId === cardInstanceId,
  );
  if (sourceIndex < 0) {
    return illegalAction(
      state,
      `playSelected requires a card in ${sourceZone}.`,
    );
  }
  const sourceCard = sourceCards[sourceIndex];
  if (sourceCard === undefined) {
    return illegalAction(state, `playSelected ${sourceZone} card not found.`);
  }
  const supported = getSupportedPlayMetadata(state, sourceCard);
  if (supported === null) {
    return illegalAction(state, "playSelected card is unsupported.");
  }
  if (supported.category !== "character" && supported.category !== "stage") {
    return illegalAction(
      state,
      "playSelected supports only Character and Stage cards.",
    );
  }
  if (
    !ignoreCost &&
    getActiveDonCount(player.costArea) <
      getEffectivePlayCost(state, playerId, sourceCard, supported)
  ) {
    return illegalAction(state, "playSelected requires enough active DON!!.");
  }
  if (!canResolveDestinationConflict(player, supported.category)) {
    return illegalAction(
      state,
      "playSelected destination conflict is invalid.",
    );
  }
  return placePlayedCardResult({
    state,
    events: [],
    playerId,
    player,
    sourceIndex,
    sourceCard,
    sourceZone,
    supported,
    costArea: player.costArea,
    enterRested,
    resolveOnPlayRuntime: false,
    incrementActionSeq: false,
    ...(supported.category === "character"
      ? {
          characterOverflowDecisionIdOverride:
            getRuntimePlaySelectedOverflowDecisionId(state, sourceCard),
          characterOverflowCausedBy: causedBy ?? {
            type: "ruleProcess" as const,
            name: "effectRuntime:playSelectedOverflow",
          },
          runtimePlaySelectedEnterRested: enterRested,
        }
      : {}),
  });
};

export const applyRuntimeActivateSelectedEvent = (params: {
  state: GameState;
  playerId: PlayerId;
  cardInstanceId: CardInstance["instanceId"];
  ignoreCost: boolean;
  causedBy?: CausalityRef;
}): EngineResult => {
  const { state, playerId, cardInstanceId, ignoreCost, causedBy } = params;
  const player = state.players[playerId];
  if (player === undefined) {
    return illegalAction(
      state,
      "activateSelectedEvent requires an existing player.",
    );
  }
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === cardInstanceId,
  );
  if (handIndex < 0) {
    return illegalAction(
      state,
      "activateSelectedEvent requires a card in hand.",
    );
  }
  const handCard = player.hand[handIndex];
  if (handCard === undefined) {
    return illegalAction(state, "activateSelectedEvent hand card not found.");
  }
  const supported = getSupportedPlayMetadata(state, handCard);
  if (supported === null || supported.category !== "event") {
    return illegalAction(
      state,
      "activateSelectedEvent supports only Event cards.",
    );
  }
  if (
    !ignoreCost &&
    getActiveDonCount(player.costArea) <
      getEffectivePlayCost(state, playerId, handCard, supported)
  ) {
    return illegalAction(
      state,
      "activateSelectedEvent requires enough active DON!!.",
    );
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "cardRevealed",
    { playerId, instanceId: handCard.instanceId, cardId: handCard.cardId },
    { type: "public" },
  );
  const revealed = events[events.length - 1];
  if (revealed !== undefined && causedBy !== undefined) {
    revealed.causedBy = causedBy;
  }
  const movedResult = moveConcreteCardsToTrash(state, events, [handCard], {
    cardMovedPayloadShape: "zoneRefs",
    cardMovedVisibility: { type: "public" },
    cardTrashedVisibility: { type: "public" },
    ...(causedBy === undefined ? {} : { causedBy }),
    clearAttachedDon: true,
    emitCardTrashed: true,
    includeCardIdentityInCardMoved: true,
    playerId,
    reason: "playCard",
    sourceZone: "hand",
  });
  appendEvent(
    state,
    events,
    "cardPlayed",
    {
      playerId,
      instanceId: handCard.instanceId,
      cardId: handCard.cardId,
      category: supported.category,
      turnNumber: state.turn.globalTurn,
    },
    { type: "public" },
  );
  const played = events[events.length - 1];
  if (played !== undefined && causedBy !== undefined) {
    played.causedBy = causedBy;
  }

  const nextStateBase: GameState = {
    ...movedResult.state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq,
  };
  delete nextStateBase.pendingDecision;
  const nextState = applyRuleProcessingCheckpoint({
    state: nextStateBase,
    events,
    phase: state.turn.phase,
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  nextState.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

export const applyRuntimePlaySource = (params: {
  state: GameState;
  entry: EffectQueueEntry;
  enterRested: boolean;
  ignoreCost: boolean;
}): EngineResult => {
  const { state, entry, enterRested, ignoreCost } = params;
  const player = state.players[entry.controllerId];
  if (player === undefined) {
    return illegalAction(state, "playSource requires an existing player.");
  }
  const trashSourceIndex = player.trash.findIndex(
    (card) =>
      card.instanceId === entry.source.instanceId &&
      card.cardId === entry.source.cardId,
  );
  const trashSource =
    trashSourceIndex < 0 ? undefined : player.trash[trashSourceIndex];
  const resolvedSourceZone =
    entry.source.zone?.zone === "trash" ||
    (entry.sourcePresencePolicy === "resolveFromDestinationZone" &&
      trashSource !== undefined)
      ? "trash"
      : "noZone";
  const sourceCard: CardInstance = {
    instanceId: entry.source.instanceId,
    cardId: entry.source.cardId,
    owner: entry.sourceSnapshot.ownerId,
    controller: entry.sourceSnapshot.controllerId,
    attachedDon: [],
    zone: trashSource?.zone ?? entry.source.zone ?? entry.sourceSnapshot.zone,
  };
  const supported = getSupportedPlayMetadata(state, sourceCard);
  if (supported === null) {
    return illegalAction(state, "playSource card is unsupported.");
  }
  if (supported.category !== "character" && supported.category !== "stage") {
    return illegalAction(
      state,
      "playSource supports only Character and Stage cards.",
    );
  }
  if (
    !ignoreCost &&
    getActiveDonCount(player.costArea) <
      getEffectivePlayCost(state, entry.controllerId, sourceCard, supported)
  ) {
    return illegalAction(state, "playSource requires enough active DON!!.");
  }
  if (!canResolveDestinationConflict(player, supported.category)) {
    return illegalAction(state, "playSource destination conflict is invalid.");
  }
  const sourceZone = resolvedSourceZone;
  const sourceIndex = sourceZone === "trash" ? trashSourceIndex : -1;
  if (sourceZone === "trash" && sourceIndex < 0) {
    return illegalAction(state, "playSource trash card not found.");
  }
  return placePlayedCardResult({
    state,
    events: [],
    playerId: entry.controllerId,
    player,
    sourceIndex,
    sourceCard,
    sourceZone,
    supported,
    costArea: player.costArea,
    enterRested,
    resolveOnPlayRuntime: false,
    incrementActionSeq: false,
    ...(supported.category === "character"
      ? {
          characterOverflowDecisionIdOverride:
            getRuntimePlaySourceOverflowDecisionId(state, sourceCard),
          characterOverflowCausedBy: {
            type: "effect" as const,
            queueEntryId: entry.id,
            effectId: entry.effectBlockId,
          },
          runtimePlaySourceOverflow: {
            source: {
              instanceId: sourceCard.instanceId,
              cardId: sourceCard.cardId,
              playerId: entry.controllerId,
              zone: sourceCard.zone,
            },
            enterRested,
            queueEntryId: entry.id,
          },
        }
      : {}),
  });
};

export const applyRuntimePlaySelectedFromHand = (params: {
  state: GameState;
  playerId: PlayerId;
  cardInstanceId: CardInstance["instanceId"];
  enterRested: boolean;
  ignoreCost: boolean;
  causedBy?: CausalityRef;
}): EngineResult => applyRuntimePlaySelected({ ...params, sourceZone: "hand" });

const applyCharacterOverflowResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    (parseCharacterOverflowDecisionInstanceId(decision.id) === null &&
      parseRuntimePlaySelectedOverflowDecisionInstanceId(decision.id) ===
        null &&
      parseRuntimePlaySourceOverflowDecisionInstanceId(decision.id) === null)
  ) {
    return illegalAction(state, "Unsupported decision type.");
  }
  if (action.response.type !== "cards") {
    return illegalAction(state, "Unsupported decision response.");
  }
  if (action.response.cards.length !== 1) {
    return illegalAction(state, "Overflow response must select one Character.");
  }
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return illegalAction(state, "Decision player does not exist.");
  }
  const runtimePlaySelectedOverflow =
    parseRuntimePlaySelectedOverflowDecisionInstanceId(decision.id) !== null;
  const runtimePlaySourceOverflow =
    parseRuntimePlaySourceOverflowDecisionInstanceId(decision.id) !== null;
  const runtimeOverflow =
    runtimePlaySelectedOverflow || runtimePlaySourceOverflow;
  const playCardInstanceId =
    parseCharacterOverflowDecisionInstanceId(decision.id) ??
    parseRuntimePlaySelectedOverflowDecisionInstanceId(decision.id) ??
    parseRuntimePlaySourceOverflowDecisionInstanceId(decision.id);
  if (playCardInstanceId === null) {
    return illegalAction(state, "Unsupported overflow decision context.");
  }
  const runtimePlaySource = decision.runtime?.playSourceOverflow;
  const runtimePlaySourceZone =
    runtimePlaySource?.source.zone ??
    (runtimePlaySource === undefined
      ? undefined
      : {
          zone: "noZone" as const,
          playerId: runtimePlaySource.source.playerId,
          slot: "temporary" as const,
        });
  const source =
    runtimePlaySourceOverflow &&
    runtimePlaySource !== undefined &&
    runtimePlaySourceZone !== undefined
      ? {
          sourceCard: {
            instanceId: runtimePlaySource.source.instanceId,
            cardId: runtimePlaySource.source.cardId,
            owner: runtimePlaySource.source.playerId,
            controller: runtimePlaySource.source.playerId,
            attachedDon: [] as CardInstance["attachedDon"],
            zone: runtimePlaySourceZone,
          },
          sourceIndex: -1,
          sourceZone: "noZone" as const,
        }
      : findPlayCardOverflowSource(player, playCardInstanceId);
  if (source === null) {
    return illegalAction(state, "Decision card not found.");
  }
  const supported = getSupportedPlayMetadata(state, source.sourceCard);
  if (supported === null || supported.category !== "character") {
    return illegalAction(state, "Decision card is unsupported.");
  }
  if (
    !runtimeOverflow &&
    shouldResolveOnPlayRuntime(state, source.sourceCard, supported) &&
    hasPendingRuntimeWork(state)
  ) {
    return illegalAction(state, "playCard requires no pending runtime work.");
  }
  const selectedRef = action.response.cards[0];
  if (selectedRef === undefined) {
    return illegalAction(state, "Overflow response must select one Character.");
  }
  const selectedCandidate = decision.candidates.find(
    (candidate) =>
      candidate.card.zone !== undefined &&
      candidate.card.instanceId === selectedRef.instanceId &&
      candidate.card.cardId === selectedRef.cardId &&
      candidate.card.playerId === selectedRef.playerId &&
      zonesEqual(candidate.card.zone, selectedRef.zone),
  );
  if (selectedCandidate === undefined) {
    return illegalAction(state, "Overflow Character selection is invalid.");
  }
  const selectedIndex = player.characters.findIndex(
    (character) =>
      character.instanceId === selectedCandidate.card.instanceId &&
      targetMatchesCard(selectedCandidate.card, character),
  );
  if (selectedIndex < 0) {
    return illegalAction(state, "Overflow Character selection is invalid.");
  }
  const runtimeEnterRested = runtimeOverflow
    ? (runtimePlaySource?.enterRested ??
      decision.runtime?.playSelectedOverflow?.enterRested ??
      findRuntimePlaySelectedOverflowEnterRested(state, decision.id) ??
      false)
    : null;

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    { decisionId: decision.id, playerId: decision.playerId },
    { type: "public" },
  );
  return placePlayedCardResult({
    state,
    events,
    playerId: decision.playerId,
    player,
    sourceIndex: source.sourceIndex,
    sourceCard: source.sourceCard,
    sourceZone: source.sourceZone,
    supported,
    costArea: player.costArea,
    selectedOverflowCharacterIndex: selectedIndex,
    ...(runtimeEnterRested === null ? {} : { enterRested: runtimeEnterRested }),
    resolveOnPlayRuntime: !runtimeOverflow,
    resolvePlayCardEffectRuntime,
    incrementActionSeq: true,
  });
};

const applyPlayCardPaymentResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult => {
  const context = getPlayCardPaymentContext(state, action);
  if (!context.ok) {
    return context.result;
  }
  const { decision, response, player, handIndex, handCard, supported } =
    context;
  if (
    shouldResolveOnPlayRuntime(state, handCard, supported) &&
    hasPendingRuntimeWork(state)
  ) {
    return illegalAction(state, "playCard requires no pending runtime work.");
  }
  const payment = validatePlayCardPaymentSelection({
    state,
    response,
    player,
    supported,
    playCost: getEffectivePlayCost(
      state,
      decision.playerId,
      handCard,
      supported,
    ),
  });
  if (!payment.ok) {
    return payment.result;
  }
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "costPaid",
    {
      playerId: decision.playerId,
      optionId: "restDon",
      selectedDonInstanceIds: payment.selectedDonInstanceIds,
    },
    { type: "public" },
  );
  appendEvent(
    state,
    events,
    "decisionResolved",
    { decisionId: decision.id, playerId: decision.playerId },
    { type: "public" },
  );

  return placePlayedCardResult({
    state,
    events,
    playerId: decision.playerId,
    player: { ...player, costArea: payment.nextCostArea },
    sourceIndex: handIndex,
    sourceCard: handCard,
    supported,
    costArea: payment.nextCostArea,
    resolvePlayCardEffectRuntime,
  });
};
