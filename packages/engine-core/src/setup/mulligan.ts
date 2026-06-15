import type {
  Action,
  CardInstance,
  DecisionId,
  EngineError,
  EngineEvent,
  EngineEventId,
  EngineResult,
  GameState,
  MulliganDecision,
  PlayerId,
  PlayerState,
  RngState,
  StateSeq,
} from "@optcg/types";

import { hashCanonicalStateValue } from "../state/canonical-state.js";
import {
  setupLifeFromDeck,
  type PreMulliganSetupGameState,
} from "./initial-state.js";
import { assertGameStateInvariants } from "../state/invariants.js";
import { shuffleDeterministic } from "../state/shuffle.js";

const OPENING_HAND_SIZE = 5;

type SetupStatus = Extract<GameState["status"], { type: "setup" }>;
type MulliganDecisionAction = Extract<Action, { type: "respondToDecision" }>;

const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toDecisionId = (value: string): DecisionId => value as DecisionId;
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

const createMulliganDecision = (
  state: GameState,
  playerId: PlayerId,
): MulliganDecision => ({
  id: toDecisionId(`mulligan:${String(state.seq)}:${playerId}`),
  type: "mulligan",
  playerId,
  prompt: "Would you like to mulligan?",
  causedBy: { type: "ruleProcess", name: "officialMulligan" },
  visibility: { type: "private", playerId },
  options: ["keep", "mulligan"],
});

const withIndexedZone = (
  card: CardInstance,
  zone: CardInstance["zone"]["zone"],
  slot: NonNullable<CardInstance["zone"]["slot"]>,
  index: number,
): CardInstance => ({
  ...card,
  zone: { zone, playerId: card.owner, slot, index },
});

const redrawOpeningHand = (
  player: PlayerState,
  rng: RngState,
): { player: PlayerState; rng: RngState } => {
  const returnedToDeck = [
    ...player.deck.map((card, index) =>
      withIndexedZone(card, "deck", "deck", index),
    ),
    ...player.hand.map((card, index) =>
      withIndexedZone(card, "deck", "deck", player.deck.length + index),
    ),
  ];
  const shuffled = shuffleDeterministic(returnedToDeck, rng);
  const hand = shuffled.items
    .slice(0, OPENING_HAND_SIZE)
    .map((card, index) => withIndexedZone(card, "hand", "hand", index));
  const afterHandDeck = shuffled.items.slice(OPENING_HAND_SIZE);
  const deck = afterHandDeck.map((card, index) =>
    withIndexedZone(card, "deck", "deck", index),
  );

  return {
    player: {
      ...player,
      hand,
      deck,
      life: [],
      hasMulliganed: true,
    },
    rng: shuffled.rng,
  };
};

const finalizeLifeAfterMulligans = (
  state: GameState,
  players: Record<PlayerId, PlayerState>,
): Record<PlayerId, PlayerState> => {
  const continuation = state.setupContinuation;
  if (continuation === undefined) {
    throw new TypeError(
      "Setup continuation is required to place life after mulligans.",
    );
  }
  const nextPlayers: Record<PlayerId, PlayerState> = { ...players };
  for (const playerId of continuation.playerOrder) {
    const player = nextPlayers[playerId];
    if (player === undefined) {
      throw new TypeError("Setup continuation player order is invalid.");
    }
    if (player.life.length !== 0) {
      throw new TypeError("Life must not be placed before mulligans resolve.");
    }
    const lifeCount = continuation.leaderLifeCounts[playerId];
    if (
      lifeCount === undefined ||
      !Number.isInteger(lifeCount) ||
      lifeCount < 0
    ) {
      throw new TypeError(
        `leaderLifeCounts for ${playerId} must be a non-negative integer.`,
      );
    }
    const lifeSetup = setupLifeFromDeck(playerId, player.deck, lifeCount);
    nextPlayers[playerId] = {
      ...player,
      life: lifeSetup.life,
      deck: lifeSetup.deck.map((card, index) =>
        withIndexedZone(card, "deck", "deck", index),
      ),
    };
  }
  return nextPlayers;
};

const createEvent = (
  state: GameState,
  seqOffset: number,
  type: EngineEvent["type"],
  payload: unknown,
  visibility: EngineEvent["visibility"],
  causedBy?: EngineEvent["causedBy"],
): EngineEvent => {
  const event: EngineEvent = {
    id: toEngineEventId(
      `event:${String(state.seq)}:${String(seqOffset)}:${type}`,
    ),
    seq: state.eventJournal.length + seqOffset,
    type,
    payload,
    visibility,
    createdAtStateSeq: toStateSeq(state.seq + 1),
  };
  if (causedBy !== undefined) {
    event.causedBy = causedBy;
  }
  return event;
};

const secondPlayerId = (
  state: GameState,
  firstPlayerId: PlayerId,
): PlayerId => {
  const playerIds = Object.keys(state.players) as PlayerId[];
  const next = playerIds.find((playerId) => playerId !== firstPlayerId);
  if (next === undefined) {
    throw new TypeError("Expected exactly two players for mulligan flow.");
  }
  return next;
};

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

export const startMulliganFlow = (
  setupState: PreMulliganSetupGameState,
): EngineResult => {
  if (setupState.pendingDecision !== undefined) {
    return toEngineResult(
      setupState,
      [],
      invalidDecision("Mulligan flow requires no pending decision."),
    );
  }
  if (setupState.setupContinuation === undefined) {
    return toEngineResult(
      setupState,
      [],
      invalidDecision(
        "Mulligan flow requires setup continuation for post-mulligan life placement.",
      ),
    );
  }

  const decision = createMulliganDecision(
    setupState,
    setupState.turn.turnPlayerId,
  );
  const events: EngineEvent[] = [
    createEvent(
      setupState,
      1,
      "decisionCreated",
      {
        kind: "mulliganDecision",
        playerId: decision.playerId,
        decisionId: decision.id,
      },
      { type: "replayOnly" },
      { type: "ruleProcess", name: "officialMulligan" },
    ),
  ];
  const nextState: GameState = {
    ...setupState,
    seq: toStateSeq(setupState.seq + 1),
    pendingDecision: decision,
    eventJournal: [...setupState.eventJournal, ...events],
  };
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

export const respondToMulliganDecision = (
  state: GameState,
  action: MulliganDecisionAction,
): EngineResult => {
  const pending = state.pendingDecision;
  if (pending === undefined || pending.type !== "mulligan") {
    return toEngineResult(
      state,
      [],
      invalidDecision("No mulligan decision is pending."),
    );
  }
  if (pending.id !== action.decisionId) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Decision id does not match pending decision."),
    );
  }
  if (action.response.type !== "mulligan") {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response type must match mulligan decision."),
    );
  }

  const player = state.players[pending.playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Pending decision player does not exist."),
    );
  }
  if (!action.response.keep && player.hasMulliganed) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Player cannot mulligan more than once."),
    );
  }

  const isFirstPlayerDecision = pending.playerId === state.turn.turnPlayerId;
  const maybeUpdated = action.response.keep
    ? { player, rng: state.rng }
    : redrawOpeningHand(player, state.rng);
  const nextPlayers: Record<PlayerId, PlayerState> = {
    ...state.players,
    [pending.playerId]: maybeUpdated.player,
  };
  const status: SetupStatus | { type: "active" } = isFirstPlayerDecision
    ? { type: "setup" }
    : { type: "active" };
  let playersAfterMulligan = nextPlayers;
  if (!isFirstPlayerDecision) {
    try {
      playersAfterMulligan = finalizeLifeAfterMulligans(state, nextPlayers);
    } catch (error) {
      return toEngineResult(
        state,
        [],
        invalidDecision(error instanceof Error ? error.message : String(error)),
      );
    }
  }
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    status,
    players: playersAfterMulligan,
    rng: maybeUpdated.rng,
  };
  const events: EngineEvent[] = [
    createEvent(
      state,
      1,
      "decisionResolved",
      {
        kind: "mulliganDecisionResolved",
        playerId: pending.playerId,
        decisionId: pending.id,
        keep: action.response.keep,
      },
      { type: "replayOnly" },
      { type: "decision", decisionId: pending.id },
    ),
  ];
  if (!action.response.keep) {
    events.push(
      createEvent(
        state,
        events.length + 1,
        "cardMoved",
        { kind: "mulliganShuffle", playerId: pending.playerId },
        { type: "replayOnly" },
        { type: "decision", decisionId: pending.id },
      ),
    );
  }
  if (isFirstPlayerDecision) {
    const nextDecision = createMulliganDecision(
      state,
      secondPlayerId(state, state.turn.turnPlayerId),
    );
    nextState.pendingDecision = nextDecision;
    events.push(
      createEvent(
        state,
        events.length + 1,
        "decisionCreated",
        {
          kind: "mulliganDecision",
          playerId: nextDecision.playerId,
          decisionId: nextDecision.id,
        },
        { type: "replayOnly" },
        { type: "ruleProcess", name: "officialMulligan" },
      ),
    );
  } else {
    delete nextState.pendingDecision;
    delete nextState.setupContinuation;
  }
  nextState.eventJournal = [...state.eventJournal, ...events];

  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};
