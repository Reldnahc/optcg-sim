import type {
  Action,
  CardInstance,
  CardRef,
  DecisionId,
  EngineError,
  EngineEvent,
  EngineEventId,
  EngineResult,
  GameState,
  LegalAction,
  PaymentOption,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import { computeView } from "./compute-view.js";
import { assertGameStateInvariants } from "./invariants.js";
import { advanceEndPhase } from "./phases.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";

const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toEngineEventId = (value: string): EngineEventId =>
  value as EngineEventId;

const toEngineResult = (
  state: GameState,
  events: EngineEvent[],
  errors?: readonly [EngineError, ...EngineError[]],
): EngineResult => {
  const result: EngineResult = {
    state,
    events,
    stateHash: hashCanonicalStateValue(state),
  };
  if (state.pendingDecision !== undefined) {
    result.decisions = [state.pendingDecision];
  }
  if (errors !== undefined) {
    result.errors = [...errors];
  }
  return result;
};

const illegalAction = (state: GameState, reason: string): EngineResult =>
  toEngineResult(state, [], [{ type: "illegalAction", reason }]);

const createEvent = (
  state: GameState,
  seqOffset: number,
  type: EngineEvent["type"],
  payload: unknown,
  visibility: EngineEvent["visibility"] = { type: "public" },
): EngineEvent => ({
  id: toEngineEventId(
    `event:${String(state.seq)}:${String(seqOffset)}:${type}`,
  ),
  seq: state.eventJournal.length + seqOffset,
  type,
  payload,
  visibility,
  causedBy: { type: "ruleProcess", name: "turnFlow" },
  createdAtStateSeq: toStateSeq(state.seq + 1),
});

const appendEvent = (
  state: GameState,
  events: EngineEvent[],
  type: EngineEvent["type"],
  payload: unknown,
  visibility: EngineEvent["visibility"] = { type: "public" },
): void => {
  events.push(createEvent(state, events.length + 1, type, payload, visibility));
};

const rebaseEvents = (
  state: GameState,
  events: EngineEvent[],
  seqOffset: number,
): EngineEvent[] =>
  events.map((event, index) => ({
    ...event,
    id: toEngineEventId(
      `event:${String(state.seq)}:${String(seqOffset + index)}:${event.type}`,
    ),
    seq: state.eventJournal.length + seqOffset + index,
    createdAtStateSeq: toStateSeq(state.seq + 1),
  }));

const getOpponentId = (
  state: GameState,
  playerId: PlayerId,
): PlayerId | null => {
  const playerIds = Object.keys(state.players) as PlayerId[];
  return playerIds.find((candidate) => candidate !== playerId) ?? null;
};

const toCardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const getAttachTargets = (state: GameState, playerId: PlayerId): CardRef[] => {
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  return [
    toCardRef(player.leader, playerId),
    ...player.characters.map((card) => toCardRef(card, playerId)),
  ];
};

const isMatchActive = (state: GameState): boolean =>
  state.status.type === "active";

const canConcede = (state: GameState): boolean =>
  state.status.type !== "completed" && state.status.type !== "gameOver";

const zonesEqual = (
  left: NonNullable<CardRef["zone"]>,
  right: CardRef["zone"],
): boolean =>
  right !== undefined &&
  left.zone === right.zone &&
  left.playerId === right.playerId &&
  left.index === right.index &&
  left.slot === right.slot;

const targetMatchesCard = (target: CardRef, card: CardInstance): boolean =>
  target.cardId === card.cardId &&
  (target.zone === undefined || zonesEqual(target.zone, card.zone));

const getCombatCardByInstanceId = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): { card: CardInstance; playerId: PlayerId; isLeader: boolean } | null => {
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    if (player.leader.instanceId === instanceId) {
      return { card: player.leader, playerId, isLeader: true };
    }
    const character = player.characters.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (character !== undefined) {
      return { card: character, playerId, isLeader: false };
    }
  }
  return null;
};

const reifyCardRef = (
  state: GameState,
  ref: CardRef,
): { card: CardInstance; playerId: PlayerId; isLeader: boolean } | null => {
  const located = getCombatCardByInstanceId(state, ref.instanceId);
  if (located === null) {
    return null;
  }
  if (
    ref.playerId !== located.playerId ||
    !targetMatchesCard(ref, located.card)
  ) {
    return null;
  }
  return located;
};

export const getLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  if (!isMatchActive(state) || state.players[playerId] === undefined) {
    return [];
  }

  const actions: LegalAction[] = [{ type: "concede", playerId }];
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
    }
    return actions;
  }
  if (state.turn.phase !== "main" || state.turn.turnPlayerId !== playerId) {
    return actions;
  }
  if (state.battle !== undefined) {
    return actions;
  }

  actions.push({ type: "endMainPhase" });
  const player = state.players[playerId];
  const activeDon = player.costArea.filter((card) => card.state === "active");
  const targets = getAttachTargets(state, playerId);
  for (const don of activeDon) {
    for (const target of targets) {
      actions.push({
        type: "attachDon",
        donInstanceId: don.instanceId,
        target,
      });
    }
  }
  for (const card of getPlayableHandCards(state, playerId)) {
    actions.push({ type: "playCard", cardInstanceId: card.instanceId });
  }

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

const applyConcede = (
  state: GameState,
  action: Extract<Action, { type: "concede" }>,
): EngineResult => {
  if (!canConcede(state)) {
    return illegalAction(
      state,
      "Concede is only legal before match completion.",
    );
  }
  if (state.players[action.playerId] === undefined) {
    return illegalAction(state, "Conceding player does not exist.");
  }
  const opponentId = getOpponentId(state, action.playerId);
  if (opponentId === null) {
    return illegalAction(state, "Concede requires exactly two players.");
  }

  const events: EngineEvent[] = [
    createEvent(
      state,
      1,
      "gameEnded",
      { winner: opponentId, loser: action.playerId, reason: "concede" },
      { type: "public" },
    ),
  ];
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    status: { type: "completed", winner: opponentId },
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

const applyEndMainPhase = (state: GameState): EngineResult => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "endMainPhase is only legal while match is active.",
    );
  }
  if (state.turn.phase !== "main") {
    return illegalAction(state, "endMainPhase requires main phase.");
  }

  const transitionEvents: EngineEvent[] = [
    createEvent(state, 1, "phaseEnded", {
      phase: "main",
      playerId: state.turn.turnPlayerId,
    }),
    createEvent(state, 2, "phaseStarted", {
      phase: "end",
      playerId: state.turn.turnPlayerId,
    }),
  ];
  const preEndState: GameState = {
    ...state,
    actionSeq: state.actionSeq + 1,
    turn: { ...state.turn, phase: "end" },
  };
  const postRuleState = applyRuleProcessingCheckpoint({
    state: preEndState,
    events: transitionEvents,
    phase: "end",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  if (postRuleState.status.type !== "active") {
    const terminalState: GameState = {
      ...postRuleState,
      seq: toStateSeq(state.seq + 1),
      eventJournal: [...state.eventJournal, ...transitionEvents],
    };
    assertGameStateInvariants(terminalState);
    return toEngineResult(terminalState, transitionEvents);
  }
  assertGameStateInvariants(preEndState);

  const endResult = advanceEndPhase(postRuleState);
  if (endResult.errors !== undefined) {
    return endResult;
  }
  const events = [
    ...transitionEvents,
    ...rebaseEvents(state, endResult.events, transitionEvents.length + 1),
  ];
  const nextState: GameState = {
    ...endResult.state,
    eventJournal: [...state.eventJournal, ...events],
  };
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

const applyAttachDon = (
  state: GameState,
  action: Extract<Action, { type: "attachDon" }>,
): EngineResult => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "attachDon is only legal while match is active.",
    );
  }
  if (state.turn.phase !== "main") {
    return illegalAction(state, "attachDon requires main phase.");
  }
  const turnPlayerId = state.turn.turnPlayerId;
  if (action.target.playerId !== turnPlayerId) {
    return illegalAction(state, "attachDon target must belong to turn player.");
  }
  const player = state.players[turnPlayerId];
  if (player === undefined) {
    return illegalAction(state, "Turn player does not exist.");
  }

  const donIndex = player.costArea.findIndex(
    (card) =>
      card.instanceId === action.donInstanceId &&
      card.state === "active" &&
      card.owner === turnPlayerId &&
      card.controller === turnPlayerId,
  );
  if (donIndex < 0) {
    return illegalAction(
      state,
      "attachDon requires an active DON!! in turn player's cost area.",
    );
  }
  const donor = player.costArea[donIndex];
  if (donor === undefined) {
    return illegalAction(state, "attachDon donor not found.");
  }

  const isLeaderTarget =
    player.leader.instanceId === action.target.instanceId &&
    targetMatchesCard(action.target, player.leader);
  const targetCharacterIndex = player.characters.findIndex(
    (character) =>
      character.instanceId === action.target.instanceId &&
      targetMatchesCard(action.target, character),
  );
  if (!isLeaderTarget && targetCharacterIndex < 0) {
    return illegalAction(
      state,
      "attachDon target must be turn player's leader or character.",
    );
  }
  const nextLeader = isLeaderTarget
    ? {
        ...player.leader,
        attachedDon: [...player.leader.attachedDon, donor.instanceId],
      }
    : player.leader;
  const nextCharacters = player.characters.map((character, index) =>
    index === targetCharacterIndex
      ? {
          ...character,
          attachedDon: [...character.attachedDon, donor.instanceId],
        }
      : character,
  );

  const updatedDon: CardInstance = { ...donor };
  delete updatedDon.state;
  const nextCostArea = player.costArea.map((card, index) =>
    index === donIndex ? updatedDon : card,
  );

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [turnPlayerId]: {
        ...player,
        leader: nextLeader,
        characters: nextCharacters,
        costArea: nextCostArea,
      },
    },
  };
  const events: EngineEvent[] = [
    createEvent(
      state,
      1,
      "donAttached",
      {
        playerId: turnPlayerId,
        donInstanceId: donor.instanceId,
        targetInstanceId: action.target.instanceId,
      },
      { type: "replayOnly" },
    ),
  ];
  const nextWithRules = applyRuleProcessingCheckpoint({
    state: nextState,
    events,
    phase: "main",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  nextWithRules.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextWithRules);
  return toEngineResult(nextWithRules, events);
};

const applyPlayCard = (
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
  if (supported.category === "character" && player.characters.length >= 5) {
    return illegalAction(state, "playCard character area is full.");
  }
  if (supported.category === "stage" && player.stage !== undefined) {
    return illegalAction(state, "playCard stage area is full.");
  }
  if (getActiveDonCount(player.costArea) < supported.printedCost) {
    return illegalAction(state, "playCard requires enough active DON!!.");
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

  const nextHand = reindexZoneCards(
    player.hand.filter((_, index) => index !== handIndex),
    "hand",
    playerId,
    "hand",
  );
  const playedCardBase = {
    ...handCard,
    attachedDon: [] as CardInstance["attachedDon"],
  };
  const playedCard: CardInstance =
    supported.category === "character"
      ? {
          ...playedCardBase,
          turnPlayed: state.turn.globalTurn,
          zone: {
            zone: "characterArea",
            playerId,
            slot: "character",
            index: player.characters.length,
          },
          state: "active",
        }
      : {
          ...playedCardBase,
          zone: { zone: "stageArea", playerId, slot: "stage", index: 0 },
          state: "active",
        };
  const nextPlayer =
    supported.category === "character"
      ? {
          ...player,
          hand: nextHand,
          characters: [...player.characters, playedCard],
        }
      : { ...player, hand: nextHand, stage: playedCard };
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
  if (decision.type !== "payCost") {
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
  if (supported.category === "character" && player.characters.length >= 5) {
    return illegalAction(state, "playCard character area is full.");
  }
  if (supported.category === "stage" && player.stage !== undefined) {
    return illegalAction(state, "playCard stage area is full.");
  }

  const restedSet = new Set(selected);
  const nextCostArea = player.costArea.map((card) =>
    restedSet.has(card.instanceId) ? { ...card, state: "rested" } : card,
  );
  const nextHand = reindexZoneCards(
    player.hand.filter((_, index) => index !== handIndex),
    "hand",
    decision.playerId,
    "hand",
  );
  const playedCardBase = {
    ...handCard,
    attachedDon: [] as CardInstance["attachedDon"],
  };
  const playedCard: CardInstance =
    supported.category === "character"
      ? {
          ...playedCardBase,
          turnPlayed: state.turn.globalTurn,
          zone: {
            zone: "characterArea",
            playerId: decision.playerId,
            slot: "character",
            index: player.characters.length,
          },
          state: "active",
        }
      : {
          ...playedCardBase,
          zone: {
            zone: "stageArea",
            playerId: decision.playerId,
            slot: "stage",
            index: 0,
          },
          state: "active",
        };
  const nextPlayer =
    supported.category === "character"
      ? {
          ...player,
          costArea: nextCostArea,
          hand: nextHand,
          characters: [...player.characters, playedCard],
        }
      : {
          ...player,
          costArea: nextCostArea,
          hand: nextHand,
          stage: playedCard,
        };
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
      playerId: decision.playerId,
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
    players: { ...state.players, [decision.playerId]: nextPlayer },
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

const applyDeclareAttack = (
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

const reindexZoneCards = (
  cards: CardInstance[],
  zone: CardInstance["zone"]["zone"],
  playerId: PlayerId,
  slot: NonNullable<CardInstance["zone"]["slot"]>,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone, playerId, slot, index },
  }));

const getSupportedPlayMetadata = (
  state: GameState,
  card: CardInstance,
): { category: "character" | "stage"; printedCost: number } | null => {
  const resolved = state.cardManifest.cards[card.cardId];
  if (
    resolved === undefined ||
    resolved.support.status !== "vanilla-confirmed"
  ) {
    return null;
  }
  if (resolved.effectText !== undefined || resolved.triggerText !== undefined) {
    return null;
  }
  if (resolved.category !== "character" && resolved.category !== "stage") {
    return null;
  }
  return {
    category: resolved.category,
    printedCost: Math.max(0, resolved.cost ?? 0),
  };
};

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
    if (supported.category === "character") {
      return player.characters.length < 5;
    }
    return player.stage === undefined;
  });
};

const getActiveDonCount = (costArea: readonly CardInstance[]): number =>
  costArea.filter((card) => card.state === "active").length;

const toDecisionId = (value: string): DecisionId => value as DecisionId;

const playCardDecisionPrefix = "decision:playCard:cost:";

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
  const value = String(decisionId);
  if (!value.startsWith(playCardDecisionPrefix)) {
    return null;
  }
  const suffix = value.slice(playCardDecisionPrefix.length);
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

export const applyAction = (state: GameState, action: Action): EngineResult => {
  if (action.type === "concede") {
    return applyConcede(state, action);
  }
  if (action.type === "respondToDecision") {
    return applyRespondToDecision(state, action);
  }
  if (state.pendingDecision !== undefined) {
    return illegalAction(
      state,
      "Phase actions are illegal while a decision is pending.",
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
  return illegalAction(state, `Unsupported action type: ${action.type}`);
};
