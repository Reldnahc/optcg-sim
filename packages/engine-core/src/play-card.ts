import type {
  Action,
  CardInstance,
  DecisionId,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PaymentOption,
  PlayerId,
} from "@optcg/types";

import {
  appendEvent,
  createEvent,
  illegalAction,
  toDecisionId,
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
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";

type SupportedPlayMetadata = {
  category: "character" | "stage";
  printedCost: number;
};

const playCardDecisionPrefix = "decision:playCard:cost:";
const characterOverflowDecisionPrefix = "decision:playCard:overflow:";

export const getPlayCardLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const actions: LegalAction[] = [];
  if (!isMatchActive(state) || state.players[playerId] === undefined) {
    return actions;
  }
  if (state.pendingDecision !== undefined) {
    const decision = state.pendingDecision;
    if (
      decision.type === "payCost" &&
      decision.playerId === playerId &&
      parsePlayCardDecisionInstanceId(decision.id) !== null
    ) {
      const count = getRestDonCount(decision.paymentOptions);
      if (count !== null) {
        const player = state.players[playerId];
        const activeDonIds = player.costArea
          .filter((card) => card.state === "active")
          .map((card) => card.instanceId);
        const combos = chooseDonCombos(activeDonIds, count);
        for (const combo of combos) {
          actions.push({
            type: "respondToDecision",
            decisionId: decision.id,
            response: {
              type: "payment",
              optionId: decision.paymentOptions[0]?.id ?? "restDon",
              selectedDonInstanceIds: combo,
            },
          });
        }
      }
    } else if (
      decision.type === "selectCards" &&
      decision.playerId === playerId &&
      parseCharacterOverflowDecisionInstanceId(decision.id) !== null
    ) {
      for (const candidate of decision.candidates) {
        actions.push({
          type: "respondToDecision",
          decisionId: decision.id,
          response: { type: "cards", cards: [candidate.card] },
        });
      }
    }
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
    const decisionId = getPlayCardDecisionId(state, handCard);
    const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
      id: decisionId,
      type: "payCost",
      playerId,
      prompt: getPlayCardDecisionPrompt(handCard),
      causedBy: {
        type: "playerAction",
        actionId: `action:${String(state.actionSeq + 1)}`,
      },
      visibility: { type: "public" },
      cost: { type: "restDon", count: supported.printedCost },
      paymentOptions: [
        { id: "restDon", type: "restDon", count: supported.printedCost },
      ],
    };
    appendEvent(
      state,
      events,
      "decisionCreated",
      { decisionId, decisionType: "payCost", playerId },
      { type: "public" },
    );
    const nextState: GameState = {
      ...state,
      seq: toStateSeq(state.seq + 1),
      actionSeq: state.actionSeq + 1,
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    };
    assertGameStateInvariants(nextState);
    return toEngineResult(nextState, events);
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

export const applyPlayCardDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined) {
    return null;
  }
  if (
    decision.type === "selectCards" &&
    parseCharacterOverflowDecisionInstanceId(decision.id) !== null
  ) {
    return applyCharacterOverflowResponse(state, action);
  }
  if (
    decision.type === "payCost" &&
    parsePlayCardDecisionInstanceId(decision.id) !== null
  ) {
    return applyPlayCardPaymentResponse(state, action);
  }
  return null;
};

const canResolveDestinationConflict = (
  player: GameState["players"][PlayerId],
  category: SupportedPlayMetadata["category"],
): boolean => {
  if (category === "character") {
    return player.characters.length <= 5;
  }
  return player.stage === undefined || player.stage.attachedDon.length === 0;
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
  category: SupportedPlayMetadata["category"];
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
  return toEngineResult(nextState, events);
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
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "payCost") {
    return illegalAction(state, "Unsupported decision type.");
  }
  if (action.response.type !== "payment") {
    return illegalAction(state, "Unsupported decision response.");
  }
  const response = action.response;
  if (decision.playerId !== state.turn.turnPlayerId) {
    return illegalAction(state, "Decision player mismatch.");
  }

  const playCardInstanceId = parsePlayCardDecisionInstanceId(decision.id);
  if (playCardInstanceId === null) {
    return illegalAction(state, "Unsupported payCost decision context.");
  }
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return illegalAction(state, "Decision player does not exist.");
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
  if (supported === null) {
    return illegalAction(state, "Decision card is unsupported.");
  }
  if (response.optionId !== "restDon") {
    return illegalAction(state, "Payment option mismatch.");
  }
  const selected = response.selectedDonInstanceIds;
  if (selected === undefined || selected.length !== supported.printedCost) {
    return illegalAction(state, "Payment DON!! selection count mismatch.");
  }
  if (new Set(selected).size !== selected.length) {
    return illegalAction(state, "Payment DON!! selection contains duplicates.");
  }
  const costAreaById = new Map(
    player.costArea.map((card) => [card.instanceId, card]),
  );
  for (const donId of selected) {
    const don = costAreaById.get(donId);
    if (don === undefined || don.state !== "active") {
      return illegalAction(state, "Payment DON!! selection is invalid.");
    }
  }
  if (!canResolveDestinationConflict(player, supported.category)) {
    return illegalAction(state, "playCard destination conflict is invalid.");
  }

  const restedSet = new Set(selected);
  const nextCostArea = player.costArea.map((card) =>
    restedSet.has(card.instanceId)
      ? { ...card, state: "rested" as const }
      : card,
  );
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "costPaid",
    {
      playerId: decision.playerId,
      optionId: "restDon",
      selectedDonInstanceIds: selected,
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
    const paidPlayer = { ...player, costArea: nextCostArea };
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
    costArea: nextCostArea,
  });
};

const getSupportedPlayMetadata = (
  state: GameState,
  card: CardInstance,
): SupportedPlayMetadata | null => {
  const resolved = state.cardManifest.cards[card.cardId];
  if (
    resolved === undefined ||
    resolved.support.status !== "vanilla-confirmed"
  ) {
    return null;
  }
  if (
    hasUnsupportedPlayText(resolved.effectText) ||
    hasUnsupportedPlayText(resolved.triggerText)
  ) {
    return null;
  }
  if (resolved.category !== "character" && resolved.category !== "stage") {
    return null;
  }
  if (resolved.cost === undefined) {
    return null;
  }
  return {
    category: resolved.category,
    printedCost: Math.max(0, resolved.cost),
  };
};

const hasUnsupportedPlayText = (text: string | undefined): boolean =>
  text !== undefined && text.trim().length > 0;

const getPlayableHandCards = (
  state: GameState,
  playerId: PlayerId,
): CardInstance[] => {
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  const activeDonCount = getActiveDonCount(player.costArea);
  return player.hand.filter((card) => {
    const supported = getSupportedPlayMetadata(state, card);
    if (supported === null) {
      return false;
    }
    if (activeDonCount < supported.printedCost) {
      return false;
    }
    return canResolveDestinationConflict(player, supported.category);
  });
};

const getActiveDonCount = (costArea: readonly CardInstance[]): number =>
  costArea.filter((card) => card.state === "active").length;

const getPlayCardDecisionId = (
  state: GameState,
  card: CardInstance,
): DecisionId =>
  toDecisionId(
    `${playCardDecisionPrefix}${String(card.instanceId)}:${String(state.seq + 1)}`,
  );

const getPlayCardDecisionPrompt = (card: CardInstance): string =>
  `Pay cost to play ${String(card.cardId)}`;

const parsePlayCardDecisionInstanceId = (
  decisionId: DecisionId,
): CardInstance["instanceId"] | null => {
  return parseDecisionInstanceId(decisionId, playCardDecisionPrefix);
};

const getCharacterOverflowDecisionId = (
  state: GameState,
  card: CardInstance,
): DecisionId =>
  toDecisionId(
    `${characterOverflowDecisionPrefix}${String(card.instanceId)}:${String(state.seq + 1)}`,
  );

const parseCharacterOverflowDecisionInstanceId = (
  decisionId: DecisionId,
): CardInstance["instanceId"] | null =>
  parseDecisionInstanceId(decisionId, characterOverflowDecisionPrefix);

const parseDecisionInstanceId = (
  decisionId: DecisionId,
  prefix: string,
): CardInstance["instanceId"] | null => {
  const value = String(decisionId);
  if (!value.startsWith(prefix)) {
    return null;
  }
  const suffix = value.slice(prefix.length);
  const sequenceSeparator = suffix.lastIndexOf(":");
  if (sequenceSeparator <= 0) {
    return null;
  }
  return suffix.slice(0, sequenceSeparator) as CardInstance["instanceId"];
};

const chooseDonCombos = (
  source: readonly CardInstance["instanceId"][],
  count: number,
): CardInstance["instanceId"][][] => {
  if (count === 0) {
    return [[]];
  }
  if (count > source.length) {
    return [];
  }
  const result: CardInstance["instanceId"][][] = [];
  const current: CardInstance["instanceId"][] = [];
  const walk = (start: number): void => {
    if (current.length === count) {
      result.push([...current]);
      return;
    }
    for (let i = start; i <= source.length - (count - current.length); i += 1) {
      const candidate = source[i];
      if (candidate === undefined) {
        continue;
      }
      current.push(candidate);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return result;
};

const getRestDonCount = (options: readonly PaymentOption[]): number | null => {
  if (options.length !== 1) {
    return null;
  }
  const option = options[0];
  if (option === undefined || option.type !== "restDon") {
    return null;
  }
  return option.count;
};
