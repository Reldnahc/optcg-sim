import type {
  CardInstance,
  CardSupportStatus,
  EngineError,
  EngineEvent,
  EngineEventId,
  EngineResult,
  GameState,
  PlayerId,
  PlayerState,
  ResolvedCard,
  StateSeq,
} from "@optcg/types";

import { isMatchActive } from "./action-state.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import {
  detectPendingRuntimeWork,
  processEffectRuntime,
} from "./effect-runtime.js";
import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";
import { deriveImplementedDslPermanentContinuousEffects } from "./effect-runtime-continuous.js";
import { assertGameStateInvariants } from "./invariants.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";
import { hasUnsupportedSupportGateText } from "./battle-support.js";

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

const invalidPhaseTransition = (
  state: GameState,
  expected: GameState["turn"]["phase"],
): EngineResult =>
  toEngineResult(
    state,
    [],
    [
      {
        type: "illegalAction",
        reason: `Phase transition requires ${expected} phase.`,
      },
    ],
  );

const createEvent = (
  state: GameState,
  seqOffset: number,
  type: EngineEvent["type"],
  payload: unknown,
  visibility: EngineEvent["visibility"] = { type: "public" },
  causedBy: EngineEvent["causedBy"] = { type: "ruleProcess", name: "turnFlow" },
): EngineEvent => ({
  id: toEngineEventId(
    `event:${String(state.seq)}:${String(seqOffset)}:${type}`,
  ),
  seq: state.eventJournal.length + seqOffset,
  type,
  payload,
  visibility,
  causedBy,
  createdAtStateSeq: toStateSeq(state.seq + 1),
});

const appendEvent = (
  events: EngineEvent[],
  state: GameState,
  type: EngineEvent["type"],
  payload: unknown,
  visibility?: EngineEvent["visibility"],
  causedBy?: EngineEvent["causedBy"],
): EngineEvent => {
  const event = createEvent(
    state,
    events.length + 1,
    type,
    payload,
    visibility,
    causedBy,
  );
  events.push(event);
  return event;
};

const expireTurnBoundaryContinuousEffects = (
  state: GameState,
  endingTurnPlayerId: PlayerId,
): GameState => ({
  ...state,
  continuousEffects: state.continuousEffects.filter((effect) => {
    if (effect.duration.type === "thisTurn") return false;
    if (
      effect.duration.type !== "untilEndOfTurn" &&
      effect.duration.type !== "untilEndOfNextTurn"
    ) {
      return true;
    }
    if (effect.duration.type === "untilEndOfNextTurn") {
      if (effect.duration.player === "self") {
        return effect.controller !== endingTurnPlayerId;
      }
      if (effect.duration.player === "opponent") {
        return effect.controller === endingTurnPlayerId;
      }
      if (effect.duration.player === "controller") {
        return effect.controller !== endingTurnPlayerId;
      }
      return effect.source.playerId !== endingTurnPlayerId;
    }
    const whoseTurn = effect.duration.whoseTurn ?? "current";
    if (whoseTurn === "current") return false;
    if (whoseTurn === "sourceController") {
      return effect.source.playerId !== endingTurnPlayerId;
    }
    return false;
  }),
});

const expireStartOfRefreshContinuousEffects = (
  state: GameState,
  refreshingPlayerId: PlayerId,
): GameState => ({
  ...state,
  continuousEffects: state.continuousEffects.filter((effect) => {
    if (effect.duration.type !== "untilStartOfNextTurn") return true;
    if (effect.duration.player === "self") {
      return effect.controller !== refreshingPlayerId;
    }
    if (effect.duration.player === "opponent") {
      return effect.controller === refreshingPlayerId;
    }
    if (effect.duration.player === "turnPlayer") {
      return refreshingPlayerId !== state.turn.turnPlayerId;
    }
    if (effect.duration.player === "nonTurnPlayer") {
      return refreshingPlayerId === state.turn.turnPlayerId;
    }
    if (effect.duration.player === "controller") {
      return effect.controller !== refreshingPlayerId;
    }
    return effect.source.playerId !== refreshingPlayerId;
  }),
});

const payloadRecord = (
  payload: unknown,
): Record<string, unknown> | undefined =>
  typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : undefined;

const hasStartedCurrentPhase = (
  state: GameState,
  phase: GameState["turn"]["phase"],
  playerId: PlayerId,
): boolean => {
  for (const event of [...state.eventJournal].reverse()) {
    if (event.type !== "phaseStarted" && event.type !== "phaseEnded") {
      continue;
    }
    const payload = payloadRecord(event.payload);
    return (
      event.type === "phaseStarted" &&
      payload?.["phase"] === phase &&
      payload["playerId"] === playerId
    );
  }
  return false;
};

const withIndexedZone = (
  card: CardInstance,
  zone: CardInstance["zone"]["zone"],
  slot: NonNullable<CardInstance["zone"]["slot"]>,
  index: number,
): CardInstance => ({
  ...card,
  zone: { zone, playerId: card.owner, slot, index },
});

const hasUnsupportedBoardCardSupport = (status: CardSupportStatus): boolean =>
  status !== "vanilla-confirmed";

const isImplementedDslBoardZone = (card: CardInstance): boolean =>
  card.zone.zone === "leaderArea" ||
  card.zone.zone === "characterArea" ||
  card.zone.zone === "stageArea";

const isSupportedImplementedDslBoardCard = (
  state: GameState,
  card: CardInstance,
  resolved: ResolvedCard,
): boolean => {
  if (resolved.support.status !== "implemented-dsl") return false;
  if (!isImplementedDslBoardZone(card)) {
    return false;
  }
  const effectDefinitionId = resolved.support.effectDefinitionId;
  if (
    effectDefinitionId === undefined ||
    resolved.support.customHandlerIds !== undefined
  ) {
    return false;
  }
  const definition = state.cardManifest.effectDefinitions?.[effectDefinitionId];
  return (
    definition !== undefined &&
    definition.effects.length > 0 &&
    definition.effects.every(
      (block) => evaluateEffectBlockRuntimeSupport(block).supported,
    )
  );
};

const unsupportedStartOfMain = (
  state: GameState,
  details: unknown,
): EngineResult =>
  toEngineResult(
    state,
    [],
    [{ type: "effectRuntimeError", effectId: "start-of-main-gate", details }],
  );

const findUnsupportedBoardCard = (
  state: GameState,
): { cardId: CardInstance["cardId"]; reason: string } | undefined => {
  const cards: CardInstance[] = [];
  let firstImplementedDslCard: CardInstance | undefined;
  for (const player of Object.values(state.players)) {
    cards.push(player.leader, ...player.characters);
    if (player.stage !== undefined) {
      cards.push(player.stage);
    }
  }

  for (const card of cards) {
    const resolved = state.cardManifest.cards[card.cardId];
    if (resolved === undefined) {
      return { cardId: card.cardId, reason: "missing-manifest" };
    }
    if (resolved.support.status === "implemented-dsl") {
      if (!isSupportedImplementedDslBoardCard(state, card, resolved)) {
        return {
          cardId: card.cardId,
          reason: "unsupported-implemented-dsl-support",
        };
      }
      firstImplementedDslCard ??= card;
      continue;
    }
    if (hasUnsupportedBoardCardSupport(resolved.support.status)) {
      return { cardId: card.cardId, reason: "non-vanilla-support-status" };
    }
    if (resolved.support.effectDefinitionId !== undefined) {
      return { cardId: card.cardId, reason: "effect-definition-present" };
    }
    if (resolved.support.customHandlerIds !== undefined) {
      return { cardId: card.cardId, reason: "custom-handlers-present" };
    }
    if (hasUnsupportedSupportGateText(resolved.effectText, resolved)) {
      return { cardId: card.cardId, reason: "effect-text-present" };
    }
    if (hasUnsupportedSupportGateText(resolved.triggerText, resolved)) {
      return { cardId: card.cardId, reason: "trigger-text-present" };
    }
  }
  if (firstImplementedDslCard !== undefined) {
    try {
      deriveImplementedDslPermanentContinuousEffects(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        cardId: firstImplementedDslCard.cardId,
        reason: `unsupported-implemented-dsl-materialization:${message}`,
      };
    }
  }
  return undefined;
};

const secondPlayerId = (
  state: GameState,
  firstPlayerId: PlayerId,
): PlayerId => {
  const playerIds = Object.keys(state.players) as PlayerId[];
  const next = playerIds.find((playerId) => playerId !== firstPlayerId);
  if (next === undefined) {
    throw new TypeError("Expected exactly two players for turn flow.");
  }
  return next;
};

const isFirstPlayerFirstTurn = (
  state: GameState,
  playerId: PlayerId,
): boolean =>
  state.turn.globalTurn === 1 && state.turn.playerTurnCounts[playerId] === 1;

const cardMatchesExactCardRestriction = (
  card: CardInstance,
  effect: GameState["continuousEffects"][number],
): boolean => {
  const target = effect.modifier.target;
  return (
    target.type === "exactCard" &&
    target.card.instanceId === card.instanceId &&
    target.card.cardId === card.cardId &&
    target.card.playerId === card.controller
  );
};

const cannotBecomeActiveDuringRefresh = (
  state: GameState,
  card: CardInstance,
): boolean =>
  state.continuousEffects.some(
    (effect) =>
      effect.modifier.layer === "restriction" &&
      effect.modifier.operation.type === "restriction" &&
      effect.modifier.operation.restriction === "cannotBecomeActive" &&
      cardMatchesExactCardRestriction(card, effect),
  );

const readyCardForRefresh = (
  state: GameState,
  card: CardInstance,
): CardInstance =>
  cannotBecomeActiveDuringRefresh(state, card)
    ? card
    : { ...card, state: "active" };

const readyPlayerCards = (
  state: GameState,
  player: PlayerState,
): PlayerState => {
  const next: PlayerState = {
    ...player,
    leader: readyCardForRefresh(state, player.leader),
    characters: player.characters.map((card) =>
      readyCardForRefresh(state, card),
    ),
    costArea: player.costArea.map((card) => readyCardForRefresh(state, card)),
  };
  if (player.stage !== undefined) {
    next.stage = readyCardForRefresh(state, player.stage);
  }
  return next;
};

export const advanceRefreshPhase = (state: GameState): EngineResult => {
  if (state.turn.phase !== "refresh") {
    return invalidPhaseTransition(state, "refresh");
  }
  const turnPlayerId = state.turn.turnPlayerId;
  const turnPlayer = state.players[turnPlayerId];
  if (turnPlayer === undefined) {
    return toEngineResult(
      state,
      [],
      [{ type: "illegalAction", reason: "Turn player does not exist." }],
    );
  }

  const events: EngineEvent[] = [];
  const refreshRestrictionState = state;
  state = expireStartOfRefreshContinuousEffects(state, turnPlayerId);
  if (!hasStartedCurrentPhase(state, "refresh", turnPlayerId)) {
    appendEvent(events, state, "phaseStarted", {
      phase: "refresh",
      playerId: turnPlayerId,
    });
  }
  const attachedDonIds = [
    ...turnPlayer.leader.attachedDon,
    ...turnPlayer.characters.flatMap((card) => card.attachedDon),
  ];
  const attachedSet = new Set(attachedDonIds);
  const costArea = turnPlayer.costArea.map((card, index) => {
    if (!attachedSet.has(card.instanceId)) {
      return withIndexedZone(card, "costArea", "cost", index);
    }
    return {
      ...withIndexedZone(card, "costArea", "cost", index),
      state: "rested" as const,
    };
  });

  for (const attachedDonId of attachedDonIds) {
    appendEvent(
      events,
      state,
      "donReturned",
      { playerId: turnPlayerId, donInstanceId: attachedDonId },
      { type: "replayOnly" },
    );
  }

  const refreshedPlayer = readyPlayerCards(refreshRestrictionState, {
    ...turnPlayer,
    leader: { ...turnPlayer.leader, attachedDon: [] },
    characters: turnPlayer.characters.map((card) => ({
      ...card,
      attachedDon: [],
    })),
    costArea,
  });
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    turn: { ...state.turn, phase: "draw" },
    players: { ...state.players, [turnPlayerId]: refreshedPlayer },
  };

  appendEvent(events, state, "phaseEnded", {
    phase: "refresh",
    playerId: turnPlayerId,
  });
  appendEvent(events, state, "phaseStarted", {
    phase: "draw",
    playerId: turnPlayerId,
  });
  const nextWithRules = applyRuleProcessingCheckpoint({
    state: nextState,
    events,
    phase: "draw",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  nextWithRules.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextWithRules);
  return toEngineResult(nextWithRules, events);
};

export const advanceDrawPhase = (state: GameState): EngineResult => {
  if (state.turn.phase !== "draw") {
    return invalidPhaseTransition(state, "draw");
  }
  const turnPlayerId = state.turn.turnPlayerId;
  const turnPlayer = state.players[turnPlayerId];
  if (turnPlayer === undefined) {
    return toEngineResult(
      state,
      [],
      [{ type: "illegalAction", reason: "Turn player does not exist." }],
    );
  }

  const events: EngineEvent[] = [];
  let nextPlayer = turnPlayer;
  if (!isFirstPlayerFirstTurn(state, turnPlayerId)) {
    const drawn = turnPlayer.deck[0];
    if (drawn !== undefined) {
      const nextDeck = turnPlayer.deck
        .slice(1)
        .map((card, index) => withIndexedZone(card, "deck", "deck", index));
      const nextHand = [
        ...turnPlayer.hand,
        withIndexedZone(drawn, "hand", "hand", turnPlayer.hand.length),
      ];
      nextPlayer = { ...turnPlayer, deck: nextDeck, hand: nextHand };
      appendEvent(
        events,
        state,
        "cardDrawn",
        { playerId: turnPlayerId, cardInstanceId: drawn.instanceId },
        { type: "replayOnly" },
      );
    }
  }

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    turn: { ...state.turn, phase: "don" },
    players: { ...state.players, [turnPlayerId]: nextPlayer },
  };
  appendEvent(events, state, "phaseEnded", {
    phase: "draw",
    playerId: turnPlayerId,
  });
  appendEvent(events, state, "phaseStarted", {
    phase: "don",
    playerId: turnPlayerId,
  });
  const nextWithRules = applyRuleProcessingCheckpoint({
    state: nextState,
    events,
    phase: "don",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  nextWithRules.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextWithRules);
  return toEngineResult(nextWithRules, events);
};

export const advanceDonPhase = (state: GameState): EngineResult => {
  if (state.turn.phase !== "don") {
    return invalidPhaseTransition(state, "don");
  }
  const turnPlayerId = state.turn.turnPlayerId;
  const turnPlayer = state.players[turnPlayerId];
  if (turnPlayer === undefined) {
    return toEngineResult(
      state,
      [],
      [{ type: "illegalAction", reason: "Turn player does not exist." }],
    );
  }

  const placeCount = isFirstPlayerFirstTurn(state, turnPlayerId) ? 1 : 2;
  const toPlace = turnPlayer.donDeck.slice(0, placeCount);
  const nextDonDeck = turnPlayer.donDeck
    .slice(toPlace.length)
    .map((card, index) => withIndexedZone(card, "donDeck", "donDeck", index));
  const nextCostArea = [
    ...turnPlayer.costArea,
    ...toPlace.map((card, index) => ({
      ...withIndexedZone(
        card,
        "costArea",
        "cost",
        turnPlayer.costArea.length + index,
      ),
      state: "active" as const,
    })),
  ];

  const events: EngineEvent[] = toPlace.map((card, index) =>
    createEvent(
      state,
      index + 1,
      "cardMoved",
      {
        playerId: turnPlayerId,
        cardInstanceId: card.instanceId,
        from: "donDeck",
        to: "costArea",
      },
      { type: "replayOnly" },
    ),
  );

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    players: {
      ...state.players,
      [turnPlayerId]: {
        ...turnPlayer,
        donDeck: nextDonDeck,
        costArea: nextCostArea,
      },
    },
  };
  const nextWithRules = applyRuleProcessingCheckpoint({
    state: nextState,
    events,
    phase: "don",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  nextWithRules.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextWithRules);
  return toEngineResult(nextWithRules, events);
};

export const enterMainPhase = (state: GameState): EngineResult => {
  if (!isMatchActive(state)) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "illegalAction",
          reason: "enterMainPhase is only legal while match is active.",
        },
      ],
    );
  }
  if (state.turn.phase !== "don") {
    return invalidPhaseTransition(state, "don");
  }
  if (detectPendingRuntimeWork(state) !== undefined) {
    return processEffectRuntime(state);
  }
  const unsupportedBoardCard = findUnsupportedBoardCard(state);
  if (unsupportedBoardCard !== undefined) {
    return unsupportedStartOfMain(state, unsupportedBoardCard);
  }
  const turnPlayerId = state.turn.turnPlayerId;
  const events: EngineEvent[] = [];
  appendEvent(events, state, "phaseEnded", {
    phase: "don",
    playerId: turnPlayerId,
  });
  appendEvent(events, state, "phaseStarted", {
    phase: "main",
    playerId: turnPlayerId,
  });

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    turn: { ...state.turn, phase: "main" },
  };
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

export const advanceEndPhase = (state: GameState): EngineResult => {
  if (state.turn.phase !== "end") {
    return invalidPhaseTransition(state, "end");
  }
  const currentTurnPlayerId = state.turn.turnPlayerId;
  const nextTurnPlayerId = secondPlayerId(state, currentTurnPlayerId);
  const nextPlayerTurnCount = state.turn.playerTurnCounts[nextTurnPlayerId];
  const nextTurnPlayer = state.players[nextTurnPlayerId];
  if (nextPlayerTurnCount === undefined) {
    return toEngineResult(
      state,
      [],
      [{ type: "illegalAction", reason: "Next turn player count is missing." }],
    );
  }
  if (nextTurnPlayer === undefined) {
    return toEngineResult(
      state,
      [],
      [{ type: "illegalAction", reason: "Next turn player does not exist." }],
    );
  }
  const incrementedNextTurnCount = nextPlayerTurnCount + 1;
  const nextCounts = {
    ...state.turn.playerTurnCounts,
    [nextTurnPlayerId]: incrementedNextTurnCount,
  };
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    players: {
      ...state.players,
      [nextTurnPlayerId]: {
        ...nextTurnPlayer,
        turnCount: incrementedNextTurnCount,
      },
    },
    turn: {
      ...state.turn,
      globalTurn: state.turn.globalTurn + 1,
      playerTurnCounts: nextCounts,
      turnPlayerId: nextTurnPlayerId,
      phase: "refresh",
    },
  };
  const nextStateWithExpiry = expireTurnBoundaryContinuousEffects(
    nextState,
    currentTurnPlayerId,
  );
  const events: EngineEvent[] = [
    createEvent(state, 1, "phaseEnded", {
      phase: "end",
      playerId: currentTurnPlayerId,
    }),
    createEvent(state, 2, "phaseStarted", {
      phase: "refresh",
      playerId: nextTurnPlayerId,
    }),
  ];
  const nextWithRules = applyRuleProcessingCheckpoint({
    state: nextStateWithExpiry,
    events,
    phase: "refresh",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  nextWithRules.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextWithRules);
  return toEngineResult(nextWithRules, events);
};
