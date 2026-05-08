import type {
  Action,
  CardInstance,
  EngineError,
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
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import {
  isMatchActive,
  reindexZoneCards,
  targetMatchesCard,
  toCardRef,
  zonesEqual,
} from "./action-state.js";
import { assertGameStateInvariants } from "./invariants.js";
import {
  getCharacterOverflowDecisionId,
  getPlayCardPendingDecisionLegalActions,
  parseCharacterOverflowDecisionInstanceId,
} from "./play-card-legal-actions.js";
import {
  createPlayCardPaymentDecisionResult,
  getPlayCardPaymentContext,
  isPlayCardPaymentDecisionId,
  validatePlayCardPaymentSelection,
} from "./play-card-payment.js";
import {
  canResolveDestinationConflict,
  getActiveDonCount,
  getPlayableHandCards,
  getSupportedPlayMetadata,
  type SupportedPlayMetadata,
} from "./play-card-support.js";
import { processEffectRuntime } from "./effect-runtime.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";

export const getPlayCardLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const actions: LegalAction[] = [];
  if (!isMatchActive(state) || state.players[playerId] === undefined) {
    return actions;
  }
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
    actions.push({ type: "playCard", cardInstanceId: card.instanceId });
  }
  return actions;
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
  if (action.costPayment !== undefined) {
    return illegalAction(
      state,
      "playCard.costPayment is illegal outside respondToDecision.",
    );
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
  if (getActiveDonCount(player.costArea) < supported.printedCost) {
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

  if (supported.printedCost > 0) {
    return createPlayCardPaymentDecisionResult({
      state,
      events,
      playerId,
      handCard,
      printedCost: supported.printedCost,
    });
  }

  if (supported.category === "character" && player.characters.length >= 5) {
    return createCharacterOverflowDecisionResult({
      state,
      events,
      playerId,
      player,
      handCard,
    });
  }

  return placePlayedCardResult({
    state,
    events,
    playerId,
    player,
    handIndex,
    handCard,
    supported,
    costArea: player.costArea,
  });
};

const hasPendingRuntimeWork = (state: GameState): boolean =>
  state.effectQueue.length > 0 || state.deferredTriggers.length > 0;

const shouldResolveOnPlayRuntime = (
  state: GameState,
  handCard: CardInstance,
  supported: SupportedPlayMetadata,
): boolean =>
  supported.category === "character" &&
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

  const queued = processEffectRuntime(acceptedState);
  if (queued.errors !== undefined) {
    return toEngineResult(originalState, [], toErrorTuple(queued.errors));
  }

  const resolved = processEffectRuntime(queued.state);
  if (resolved.errors !== undefined) {
    return toEngineResult(originalState, [], toErrorTuple(resolved.errors));
  }

  const events = [...acceptedEvents, ...queued.events, ...resolved.events];
  const stateWithJournal: GameState = {
    ...resolved.state,
    eventJournal: [...originalState.eventJournal, ...events],
  };
  assertGameStateInvariants(stateWithJournal);
  return toEngineResult(stateWithJournal, events);
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
    parseCharacterOverflowDecisionInstanceId(decision.id) !== null
  ) {
    return applyCharacterOverflowResponse(state, action);
  }
  if (decision.type === "payCost" && isPlayCardPaymentDecisionId(decision.id)) {
    return applyPlayCardPaymentResponse(state, action);
  }
  return null;
};

const createCharacterOverflowDecisionResult = (params: {
  state: GameState;
  events: EngineEvent[];
  playerId: PlayerId;
  player: GameState["players"][PlayerId];
  handCard: CardInstance;
}): EngineResult => {
  const { state, events, playerId, player, handCard } = params;
  const decisionId = getCharacterOverflowDecisionId(state, handCard);
  const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
    id: decisionId,
    type: "selectCards",
    playerId,
    prompt: `Choose a Character to trash for ${String(handCard.cardId)}`,
    causedBy: {
      type: "playerAction",
      actionId: `action:${String(state.actionSeq + 1)}`,
    },
    visibility: { type: "public" },
    request: {
      timing: "onActivation",
      chooser: "turnPlayer",
      player: "turnPlayer",
      zone: "characterArea",
      filter: { categories: ["character"] },
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "public",
    },
    candidates: player.characters.map((character) => ({
      card: toCardRef(character, playerId),
      visibility: { type: "public" },
    })),
  };
  appendEvent(
    state,
    events,
    "decisionCreated",
    { decisionId, decisionType: "selectCards", playerId },
    { type: "public" },
  );
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    pendingDecision,
    players: { ...state.players, [playerId]: player },
    eventJournal: [...state.eventJournal, ...events],
  };
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

const createPlayedCard = (params: {
  state: GameState;
  handCard: CardInstance;
  playerId: PlayerId;
  category: Exclude<SupportedPlayMetadata["category"], "event">;
  characterIndex: number;
}): CardInstance => {
  const { state, handCard, playerId, category, characterIndex } = params;
  const playedCardBase = {
    ...handCard,
    attachedDon: [] as CardInstance["attachedDon"],
  };
  return category === "character"
    ? {
        ...playedCardBase,
        turnPlayed: state.turn.globalTurn,
        zone: {
          zone: "characterArea",
          playerId,
          slot: "character",
          index: characterIndex,
        },
        state: "active",
      }
    : {
        ...playedCardBase,
        zone: { zone: "stageArea", playerId, slot: "stage", index: 0 },
        state: "active",
      };
};

const placePlayedCardResult = (params: {
  state: GameState;
  events: EngineEvent[];
  playerId: PlayerId;
  player: GameState["players"][PlayerId];
  handIndex: number;
  handCard: CardInstance;
  supported: SupportedPlayMetadata;
  costArea: CardInstance[];
  selectedOverflowCharacterIndex?: number;
}): EngineResult => {
  const {
    state,
    events,
    playerId,
    player,
    handIndex,
    handCard,
    supported,
    costArea,
    selectedOverflowCharacterIndex,
  } = params;
  const nextHand = reindexZoneCards(
    player.hand.filter((_, index) => index !== handIndex),
    "hand",
    playerId,
    "hand",
  );

  let nextCharacters = player.characters;
  let nextTrash = player.trash;
  let nextCostArea = costArea;
  if (supported.category === "event") {
    const trashedEvent: CardInstance = {
      ...handCard,
      attachedDon: [],
      zone: { zone: "trash", playerId, slot: "trash", index: 0 },
    };
    nextTrash = reindexZoneCards(
      [trashedEvent, ...nextTrash],
      "trash",
      playerId,
      "trash",
    );
    const nextPlayer = {
      ...player,
      costArea: nextCostArea,
      hand: nextHand,
      trash: nextTrash,
    };
    appendEvent(
      state,
      events,
      "cardMoved",
      {
        instanceId: handCard.instanceId,
        cardId: handCard.cardId,
        from: handCard.zone,
        to: trashedEvent.zone,
        reason: "playCard",
      },
      { type: "public" },
    );
    appendEvent(
      state,
      events,
      "cardTrashed",
      {
        playerId,
        instanceId: handCard.instanceId,
        cardId: handCard.cardId,
        reason: "playCard",
      },
      { type: "public" },
    );
    appendEvent(
      state,
      events,
      "cardPlayed",
      {
        playerId,
        instanceId: handCard.instanceId,
        cardId: handCard.cardId,
        category: supported.category,
      },
      { type: "public" },
    );
    const nextStateBase: GameState = {
      ...state,
      seq: toStateSeq(state.seq + 1),
      actionSeq: state.actionSeq + 1,
      players: { ...state.players, [playerId]: nextPlayer },
    };
    delete nextStateBase.pendingDecision;
    const nextState = applyRuleProcessingCheckpoint({
      state: nextStateBase,
      events,
      phase: "main",
      createEvent: (seqOffset, type, payload, visibility) =>
        createEvent(state, seqOffset, type, payload, visibility),
    });
    nextState.eventJournal = [...state.eventJournal, ...events];
    assertGameStateInvariants(nextState);
    return resolvePlayCardEffectRuntime(
      state,
      nextState,
      events,
      handCard,
      supported,
    );
  }

  if (
    supported.category === "character" &&
    selectedOverflowCharacterIndex !== undefined
  ) {
    const overflowCharacter = player.characters[selectedOverflowCharacterIndex];
    if (overflowCharacter === undefined) {
      return illegalAction(state, "Overflow Character selection is stale.");
    }
    const trashedCard: CardInstance = {
      ...overflowCharacter,
      attachedDon: [],
      zone: { zone: "trash", playerId, slot: "trash", index: 0 },
    };
    nextCharacters = reindexZoneCards(
      player.characters.filter(
        (_, index) => index !== selectedOverflowCharacterIndex,
      ),
      "characterArea",
      playerId,
      "character",
    );
    nextTrash = reindexZoneCards(
      [trashedCard, ...player.trash],
      "trash",
      playerId,
      "trash",
    );
    const attachedDonIds = new Set(overflowCharacter.attachedDon);
    nextCostArea = costArea.map((card) =>
      attachedDonIds.has(card.instanceId)
        ? { ...card, state: "rested" as const }
        : card,
    );
    appendEvent(state, events, "cardMoved", {
      instanceId: overflowCharacter.instanceId,
      cardId: overflowCharacter.cardId,
      from: overflowCharacter.zone,
      to: trashedCard.zone,
      reason: "ruleProcessCharacterOverflow",
    });
    appendEvent(state, events, "cardTrashed", {
      playerId,
      instanceId: overflowCharacter.instanceId,
      cardId: overflowCharacter.cardId,
      reason: "ruleProcessCharacterOverflow",
    });
    for (const donId of overflowCharacter.attachedDon) {
      appendEvent(
        state,
        events,
        "donReturned",
        { playerId, donInstanceId: donId, state: "rested" },
        { type: "replayOnly" },
      );
    }
  }

  if (supported.category === "stage" && player.stage !== undefined) {
    if (player.stage.attachedDon.length > 0) {
      return illegalAction(
        state,
        "Stage replacement with attached DON!! is unsupported.",
      );
    }
    const trashedStage: CardInstance = {
      ...player.stage,
      zone: { zone: "trash", playerId, slot: "trash", index: 0 },
    };
    nextTrash = reindexZoneCards(
      [trashedStage, ...nextTrash],
      "trash",
      playerId,
      "trash",
    );
    appendEvent(state, events, "cardMoved", {
      instanceId: player.stage.instanceId,
      cardId: player.stage.cardId,
      from: player.stage.zone,
      to: trashedStage.zone,
      reason: "ruleProcessStageReplacement",
    });
    appendEvent(state, events, "cardTrashed", {
      playerId,
      instanceId: player.stage.instanceId,
      cardId: player.stage.cardId,
      reason: "ruleProcessStageReplacement",
    });
  }

  const playedCard = createPlayedCard({
    state,
    handCard,
    playerId,
    category: supported.category,
    characterIndex: nextCharacters.length,
  });
  const nextPlayer =
    supported.category === "character"
      ? {
          ...player,
          costArea: nextCostArea,
          hand: nextHand,
          characters: [...nextCharacters, playedCard],
          trash: nextTrash,
        }
      : {
          ...player,
          costArea: nextCostArea,
          hand: nextHand,
          stage: playedCard,
          trash: nextTrash,
        };
  appendEvent(
    state,
    events,
    "cardMoved",
    {
      instanceId: handCard.instanceId,
      cardId: handCard.cardId,
      from: handCard.zone,
      to: playedCard.zone,
      reason: "playCard",
    },
    { type: "public" },
  );
  appendEvent(
    state,
    events,
    "cardPlayed",
    {
      playerId,
      instanceId: handCard.instanceId,
      cardId: handCard.cardId,
      category: supported.category,
    },
    { type: "public" },
  );
  const nextStateBase: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: { ...state.players, [playerId]: nextPlayer },
  };
  delete nextStateBase.pendingDecision;
  const nextState = applyRuleProcessingCheckpoint({
    state: nextStateBase,
    events,
    phase: "main",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  nextState.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextState);
  return resolvePlayCardEffectRuntime(
    state,
    nextState,
    events,
    handCard,
    supported,
  );
};

const applyCharacterOverflowResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    parseCharacterOverflowDecisionInstanceId(decision.id) === null
  ) {
    return illegalAction(state, "Unsupported decision type.");
  }
  if (decision.playerId !== state.turn.turnPlayerId) {
    return illegalAction(state, "Decision player mismatch.");
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
  const playCardInstanceId = parseCharacterOverflowDecisionInstanceId(
    decision.id,
  );
  if (playCardInstanceId === null) {
    return illegalAction(state, "Unsupported overflow decision context.");
  }
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === playCardInstanceId,
  );
  if (handIndex < 0) {
    return illegalAction(state, "Decision card reference is stale.");
  }
  const handCard = player.hand[handIndex];
  if (handCard === undefined) {
    return illegalAction(state, "Decision card not found.");
  }
  const supported = getSupportedPlayMetadata(state, handCard);
  if (supported === null || supported.category !== "character") {
    return illegalAction(state, "Decision card is unsupported.");
  }
  if (
    shouldResolveOnPlayRuntime(state, handCard, supported) &&
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
    handIndex,
    handCard,
    supported,
    costArea: player.costArea,
    selectedOverflowCharacterIndex: selectedIndex,
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

  if (supported.category === "character" && player.characters.length >= 5) {
    const paidPlayer = { ...player, costArea: payment.nextCostArea };
    return createCharacterOverflowDecisionResult({
      state,
      events,
      playerId: decision.playerId,
      player: paidPlayer,
      handCard,
    });
  }

  return placePlayedCardResult({
    state,
    events,
    playerId: decision.playerId,
    player,
    handIndex,
    handCard,
    supported,
    costArea: payment.nextCostArea,
  });
};
