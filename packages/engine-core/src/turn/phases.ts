import type {
  CardInstance,
  EngineError,
  EngineEvent,
  EngineEventId,
  EngineResult,
  GameState,
  PlayerId,
  PlayerState,
  StateSeq,
} from "@optcg/types";

import { isMatchActive } from "../actions/state.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import {
  detectPendingRuntimeWork,
  processEffectRuntime,
} from "../effect-runtime.js";
import { deriveImplementedDslPermanentContinuousEffects } from "../runtime/continuous/continuous.js";
import { canBecomeActive } from "../runtime/continuous/state-transition-guards.js";
import { assertGameStateInvariants } from "../state/invariants.js";
import { applyRuleProcessingCheckpoint } from "../rules/rule-processing.js";

const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toEngineEventId = (value: string): EngineEventId =>
  value as EngineEventId;

export interface PhaseAdvanceOptions {
  readonly includeStateHash?: boolean;
  readonly profileSpan?: <T>(name: string, fn: () => T) => T;
  readonly validateInvariants?: boolean;
}

const profilePhaseSpan = <T>(
  options: PhaseAdvanceOptions,
  name: string,
  fn: () => T,
): T => options.profileSpan?.(name, fn) ?? fn();

const assertPhaseInvariants = (
  options: PhaseAdvanceOptions,
  name: string,
  state: GameState,
): void => {
  if (options.validateInvariants === false) {
    return;
  }
  profilePhaseSpan(options, name, () => {
    assertGameStateInvariants(state);
  });
};

const toEngineResult = (
  state: GameState,
  events: EngineEvent[],
  errors?: readonly [EngineError, ...EngineError[]],
  options: PhaseAdvanceOptions = {},
): EngineResult => {
  const result: EngineResult = {
    state,
    events,
    stateHash:
      options.includeStateHash === false ? "" : hashCanonicalStateValue(state),
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

const materializeBoardContinuousEffects = (
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
    if (resolved?.support.status === "implemented-dsl") {
      firstImplementedDslCard ??= card;
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

const readyCardForRefresh = (
  state: GameState,
  card: CardInstance,
): CardInstance =>
  canBecomeActive(state, card) ? { ...card, state: "active" } : card;

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

export const advanceRefreshPhase = (
  state: GameState,
  options: PhaseAdvanceOptions = {},
): EngineResult => {
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
  state = profilePhaseSpan(options, "advanceRefreshPhase:expireEffects", () =>
    expireStartOfRefreshContinuousEffects(state, turnPlayerId),
  );
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

  const refreshedPlayer = profilePhaseSpan(
    options,
    "advanceRefreshPhase:readyPlayerCards",
    () =>
      readyPlayerCards(refreshRestrictionState, {
        ...turnPlayer,
        leader: { ...turnPlayer.leader, attachedDon: [] },
        characters: turnPlayer.characters.map((card) => ({
          ...card,
          attachedDon: [],
        })),
        costArea,
      }),
  );
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
  const nextWithRules = profilePhaseSpan(
    options,
    "advanceRefreshPhase:applyRules",
    () =>
      applyRuleProcessingCheckpoint({
        state: nextState,
        events,
        phase: "draw",
        createEvent: (seqOffset, type, payload, visibility) =>
          createEvent(state, seqOffset, type, payload, visibility),
      }),
  );
  profilePhaseSpan(options, "advanceRefreshPhase:appendJournal", () => {
    nextWithRules.eventJournal = [...state.eventJournal, ...events];
  });
  assertPhaseInvariants(
    options,
    "advanceRefreshPhase:assertInvariants",
    nextWithRules,
  );
  return toEngineResult(nextWithRules, events, undefined, options);
};

export const advanceDrawPhase = (
  state: GameState,
  options: PhaseAdvanceOptions = {},
): EngineResult => {
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
      const nextDeck = profilePhaseSpan(
        options,
        "advanceDrawPhase:reindexDeck",
        () =>
          turnPlayer.deck
            .slice(1)
            .map((card, index) => withIndexedZone(card, "deck", "deck", index)),
      );
      const moved = profilePhaseSpan(options, "advanceDrawPhase:moveCard", () =>
        withIndexedZone(drawn, "hand", "hand", turnPlayer.hand.length),
      );
      const nextHand = [...turnPlayer.hand, moved];
      nextPlayer = { ...turnPlayer, deck: nextDeck, hand: nextHand };
      appendEvent(
        events,
        state,
        "cardDrawn",
        { playerId: turnPlayerId, cardInstanceId: drawn.instanceId },
        { type: "replayOnly" },
      );
      appendEvent(
        events,
        state,
        "cardMoved",
        { from: "deck", to: "hand", playerId: turnPlayerId, reason: "draw" },
        { type: "public" },
      );
      appendEvent(
        events,
        state,
        "cardMoved",
        {
          from: {
            zone: "deck",
            playerId: turnPlayerId,
            slot: "deck",
            index: 0,
          },
          to: moved.zone,
          playerId: turnPlayerId,
          reason: "draw",
          instanceId: moved.instanceId,
          cardId: moved.cardId,
        },
        { type: "private", playerId: turnPlayerId },
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
  const nextWithRules = profilePhaseSpan(
    options,
    "advanceDrawPhase:applyRules",
    () =>
      applyRuleProcessingCheckpoint({
        state: nextState,
        events,
        phase: "don",
        createEvent: (seqOffset, type, payload, visibility) =>
          createEvent(state, seqOffset, type, payload, visibility),
      }),
  );
  profilePhaseSpan(options, "advanceDrawPhase:appendJournal", () => {
    nextWithRules.eventJournal = [...state.eventJournal, ...events];
  });
  assertPhaseInvariants(
    options,
    "advanceDrawPhase:assertInvariants",
    nextWithRules,
  );
  return toEngineResult(nextWithRules, events, undefined, options);
};

export const advanceDonPhase = (
  state: GameState,
  options: PhaseAdvanceOptions = {},
): EngineResult => {
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
  const nextDonDeck = profilePhaseSpan(
    options,
    "advanceDonPhase:reindexDonDeck",
    () =>
      turnPlayer.donDeck
        .slice(toPlace.length)
        .map((card, index) =>
          withIndexedZone(card, "donDeck", "donDeck", index),
        ),
  );
  const nextCostArea = profilePhaseSpan(
    options,
    "advanceDonPhase:buildCostArea",
    () => [
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
    ],
  );

  const events: EngineEvent[] = profilePhaseSpan(
    options,
    "advanceDonPhase:createEvents",
    () =>
      toPlace.map((card, index) =>
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
  const nextWithRules = profilePhaseSpan(
    options,
    "advanceDonPhase:applyRules",
    () =>
      applyRuleProcessingCheckpoint({
        state: nextState,
        events,
        phase: "don",
        createEvent: (seqOffset, type, payload, visibility) =>
          createEvent(state, seqOffset, type, payload, visibility),
      }),
  );
  profilePhaseSpan(options, "advanceDonPhase:appendJournal", () => {
    nextWithRules.eventJournal = [...state.eventJournal, ...events];
  });
  assertPhaseInvariants(
    options,
    "advanceDonPhase:assertInvariants",
    nextWithRules,
  );
  return toEngineResult(nextWithRules, events, undefined, options);
};

export const enterMainPhase = (
  state: GameState,
  options: PhaseAdvanceOptions = {},
): EngineResult => {
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
  if (
    profilePhaseSpan(options, "enterMainPhase:detectPendingRuntimeWork", () =>
      detectPendingRuntimeWork(state),
    ) !== undefined
  ) {
    return profilePhaseSpan(
      options,
      "enterMainPhase:processEffectRuntime",
      () => processEffectRuntime(state),
    );
  }
  const unsupportedContinuousMaterialization = profilePhaseSpan(
    options,
    "enterMainPhase:materializeContinuous",
    () => materializeBoardContinuousEffects(state),
  );
  if (unsupportedContinuousMaterialization !== undefined) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "effectRuntimeError",
          effectId: "start-of-main-continuous-materialization",
          details: unsupportedContinuousMaterialization,
        },
      ],
    );
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
  const nextWithRules = profilePhaseSpan(
    options,
    "enterMainPhase:applyRules",
    () =>
      applyRuleProcessingCheckpoint({
        state: nextState,
        events,
        phase: "main",
        createEvent: (seqOffset, type, payload, visibility) =>
          createEvent(state, seqOffset, type, payload, visibility),
      }),
  );
  profilePhaseSpan(options, "enterMainPhase:appendJournal", () => {
    nextWithRules.eventJournal = [...state.eventJournal, ...events];
  });
  assertPhaseInvariants(
    options,
    "enterMainPhase:assertInvariants",
    nextWithRules,
  );
  return toEngineResult(nextWithRules, events, undefined, options);
};

export const advanceEndPhase = (
  state: GameState,
  options: PhaseAdvanceOptions = {},
): EngineResult => {
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
  const nextWithRules = profilePhaseSpan(
    options,
    "advanceEndPhase:applyRules",
    () =>
      applyRuleProcessingCheckpoint({
        state: nextStateWithExpiry,
        events,
        phase: "refresh",
        createEvent: (seqOffset, type, payload, visibility) =>
          createEvent(state, seqOffset, type, payload, visibility),
      }),
  );
  profilePhaseSpan(options, "advanceEndPhase:appendJournal", () => {
    nextWithRules.eventJournal = [...state.eventJournal, ...events];
  });
  assertPhaseInvariants(
    options,
    "advanceEndPhase:assertInvariants",
    nextWithRules,
  );
  return toEngineResult(nextWithRules, events, undefined, options);
};
