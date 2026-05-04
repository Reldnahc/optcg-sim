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

import { hashCanonicalStateValue } from "./canonical-state.js";
import type { PreMulliganSetupGameState } from "./initial-state.js";
import { assertGameStateInvariants } from "./invariants.js";
import { advanceRngUint32 } from "./rng.js";

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
  prompt: "Choose whether to keep your hand or mulligan.",
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

const shuffleCardsDeterministic = (
  cards: CardInstance[],
  rng: RngState,
): { cards: CardInstance[]; rng: RngState } => {
  const shuffled = [...cards];
  let nextRng = rng;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const draw = advanceRngUint32(nextRng);
    nextRng = draw.nextRng;
    const swapIndex = draw.value % (index + 1);
    const left = shuffled[index];
    const right = shuffled[swapIndex];
    if (left === undefined || right === undefined) {
      throw new TypeError("Deterministic shuffle index out of bounds.");
    }
    shuffled[index] = right;
    shuffled[swapIndex] = left;
  }
  return { cards: shuffled, rng: nextRng };
};

const redrawOpeningHand = (
  player: PlayerState,
  rng: RngState,
): { player: PlayerState; rng: RngState } => {
  const lifeCount = player.life.length;
  const lifeDeckOrder = [...player.life]
    .reverse()
    .map((lifeCard) => lifeCard.card);
  const returnedToDeck = [
    ...lifeDeckOrder.map((card, index) =>
      withIndexedZone(card, "deck", "deck", index),
    ),
    ...player.deck.map((card, index) =>
      withIndexedZone(card, "deck", "deck", lifeDeckOrder.length + index),
    ),
    ...player.hand.map((card, index) =>
      withIndexedZone(
        card,
        "deck",
        "deck",
        lifeDeckOrder.length + player.deck.length + index,
      ),
    ),
  ];
  const shuffled = shuffleCardsDeterministic(returnedToDeck, rng);
  const hand = shuffled.cards
    .slice(0, OPENING_HAND_SIZE)
    .map((card, index) => withIndexedZone(card, "hand", "hand", index));
  const afterHandDeck = shuffled.cards.slice(OPENING_HAND_SIZE);
  const lifeDeckSlice = afterHandDeck.slice(0, lifeCount);
  const life = [...lifeDeckSlice].reverse().map((card, index) => ({
    card: withIndexedZone(card, "life", "life", index),
    faceUp: false,
  }));
  const deck = afterHandDeck
    .slice(lifeCount)
    .map((card, index) => withIndexedZone(card, "deck", "deck", index));

  return {
    player: {
      ...player,
      hand,
      deck,
      life,
      hasMulliganed: true,
    },
    rng: shuffled.rng,
  };
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
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    status,
    players: nextPlayers,
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
  }
  nextState.eventJournal = [...state.eventJournal, ...events];

  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};
