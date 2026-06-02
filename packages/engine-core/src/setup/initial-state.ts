import type {
  CardId,
  CardInstance,
  EngineError,
  GameState,
  MatchCardManifest,
  MatchId,
  PlayerId,
  PlayerState,
  RngState,
  StateSeq,
} from "@optcg/types";

import { assertGameStateInvariants } from "../invariants.js";
import { advanceRngUint32, initializeRng } from "../rng.js";
import {
  collectStartOfGamePlans,
  createStartOfGameSetupDecision,
} from "./start-of-game-effects.js";
import { appendEvent } from "../action-results.js";

const OPENING_HAND_SIZE = 5;
const INITIAL_STATE_SEQ = 0 as StateSeq;

type SetupStatus = Extract<GameState["status"], { type: "setup" }>;

export type PreMulliganSetupGameState = GameState & { status: SetupStatus };

const cloneMatchCardManifest = (
  manifest: MatchCardManifest,
): MatchCardManifest => structuredClone(manifest);

export interface CreateInitialStateInput {
  matchId: MatchId;
  playerOrder: readonly [PlayerId, PlayerId];
  firstPlayerId: PlayerId;
  deckCardIds: Record<PlayerId, CardId[]>;
  donDeckCardIds: Record<PlayerId, CardId[]>;
  leaderCardIds: Record<PlayerId, CardId>;
  leaderLifeCounts: Record<PlayerId, number>;
  cardManifest: MatchCardManifest;
  rngSeed: number | bigint | string;
  shuffleDecks?: boolean;
  startOfGameSelections?: readonly unknown[];
}

const createCard = (
  playerId: PlayerId,
  cardId: CardId,
  zone: CardInstance["zone"],
  identitySuffix: string,
): CardInstance => ({
  instanceId: `${playerId}:${identitySuffix}` as CardInstance["instanceId"],
  cardId,
  owner: playerId,
  controller: playerId,
  zone,
  attachedDon: [],
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

const requirePlayerValue = <T>(
  record: Record<PlayerId, T>,
  playerId: PlayerId,
  label: string,
): T => {
  const value = record[playerId];
  if (value === undefined) {
    throw new TypeError(`Missing ${label} for player ${playerId}.`);
  }
  return value;
};

const toEngineErrorReason = (error: EngineError): string =>
  "reason" in error && typeof error.reason === "string"
    ? error.reason
    : error.type;

const shuffleCardsDeterministic = (
  cards: CardInstance[],
  rng: RngState,
): { cards: CardInstance[]; rng: RngState } => {
  const shuffled = [...cards];
  let nextRng = rng;
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const draw = advanceRngUint32(nextRng);
    nextRng = draw.nextRng;
    const j = draw.value % (i + 1);
    const left = shuffled[i];
    const right = shuffled[j];
    if (left === undefined || right === undefined) {
      throw new TypeError("Deterministic shuffle index out of bounds.");
    }
    shuffled[i] = right;
    shuffled[j] = left;
  }
  return { cards: shuffled, rng: nextRng };
};

const setupLifeFromDeck = (
  playerId: PlayerId,
  deck: CardInstance[],
  lifeCount: number,
): { deck: CardInstance[]; life: PlayerState["life"] } => {
  const takenInDeckOrder = deck.slice(0, lifeCount);
  const remainingDeck = deck.slice(lifeCount);
  const life = [...takenInDeckOrder].reverse().map((card, index) => ({
    card: withIndexedZone(card, "life", "life", index),
    faceUp: false,
  }));
  return { deck: remainingDeck, life };
};

const createPlayerState = (params: {
  playerId: PlayerId;
  deckCardIds: CardId[];
  donDeckCardIds: CardId[];
  leaderCardId: CardId;
  leaderLifeCount: number;
  shuffleDecks: boolean;
  rng: RngState;
  turnCount: number;
}): { playerState: PlayerState; rng: RngState } => {
  const leader = createCard(
    params.playerId,
    params.leaderCardId,
    { zone: "leaderArea", playerId: params.playerId, slot: "leader" },
    "leader",
  );

  const seededDeck = params.deckCardIds.map((cardId, index) =>
    createCard(
      params.playerId,
      cardId,
      { zone: "deck", playerId: params.playerId, slot: "deck", index },
      `deck:${String(index)}:${cardId}`,
    ),
  );
  const seededDonDeck = params.donDeckCardIds.map((cardId, index) =>
    createCard(
      params.playerId,
      cardId,
      { zone: "donDeck", playerId: params.playerId, slot: "donDeck", index },
      `don:${String(index)}:${cardId}`,
    ),
  );

  const initialDeck = seededDeck.map((card, index) =>
    withIndexedZone(card, "deck", "deck", index),
  );

  return {
    playerState: {
      playerId: params.playerId,
      deck: initialDeck,
      donDeck: seededDonDeck,
      hand: [],
      trash: [],
      leader,
      characters: [],
      costArea: [],
      life: [],
      hasMulliganed: false,
      turnCount: params.turnCount,
    },
    rng: params.rng,
  };
};

const finalizePlayerSetup = (params: {
  player: PlayerState;
  lifeCount: number;
  rng: RngState;
  shuffleDecks: boolean;
}): { player: PlayerState; rng: RngState } => {
  const shuffledDeck = params.shuffleDecks
    ? shuffleCardsDeterministic(params.player.deck, params.rng)
    : { cards: params.player.deck, rng: params.rng };
  const openingHand = shuffledDeck.cards
    .slice(0, OPENING_HAND_SIZE)
    .map((card, index) => withIndexedZone(card, "hand", "hand", index));
  const afterHandDeck = shuffledDeck.cards.slice(OPENING_HAND_SIZE);
  const lifeSetup = setupLifeFromDeck(
    params.player.playerId,
    afterHandDeck,
    params.lifeCount,
  );
  return {
    player: {
      ...params.player,
      hand: openingHand,
      life: lifeSetup.life,
      deck: lifeSetup.deck.map((card, index) =>
        withIndexedZone(card, "deck", "deck", index),
      ),
    },
    rng: shuffledDeck.rng,
  };
};

export const finalizeSetupFromContinuation = (
  state: PreMulliganSetupGameState,
): PreMulliganSetupGameState => {
  const continuation = state.setupContinuation;
  if (continuation === undefined) {
    throw new TypeError(
      "Setup continuation is required for setup finalization.",
    );
  }
  if (
    !Number.isInteger(continuation.nextStartOfGamePlanIndex) ||
    continuation.nextStartOfGamePlanIndex < 0
  ) {
    throw new TypeError(
      "Setup continuation plan index must be a non-negative integer.",
    );
  }
  const [firstPlayerId, secondPlayerId] = continuation.playerOrder;
  if (
    state.players[firstPlayerId] === undefined ||
    state.players[secondPlayerId] === undefined
  ) {
    throw new TypeError(
      "Setup continuation player order must match state players.",
    );
  }
  const keys = Object.keys(continuation.leaderLifeCounts);
  if (
    keys.length !== 2 ||
    !keys.includes(firstPlayerId) ||
    !keys.includes(secondPlayerId)
  ) {
    throw new TypeError(
      "Setup continuation leaderLifeCounts must match playerOrder players.",
    );
  }

  let rng = state.rng;
  const nextPlayers: Record<PlayerId, PlayerState> = { ...state.players };
  for (const playerId of continuation.playerOrder) {
    const lifeCount = requirePlayerValue(
      continuation.leaderLifeCounts,
      playerId,
      "leaderLifeCounts",
    );
    if (!Number.isInteger(lifeCount) || lifeCount < 0) {
      throw new TypeError(
        `leaderLifeCounts for ${playerId} must be a non-negative integer.`,
      );
    }
    const finalized = finalizePlayerSetup({
      player: requirePlayerValue(nextPlayers, playerId, "players"),
      lifeCount,
      rng,
      shuffleDecks: continuation.shuffleDecks,
    });
    nextPlayers[playerId] = finalized.player;
    rng = finalized.rng;
  }

  const nextState: PreMulliganSetupGameState = {
    ...state,
    players: nextPlayers,
    rng,
  };
  delete nextState.setupContinuation;
  return nextState;
};

/**
 * Creates authoritative deterministic setup output before official mulligan.
 */
export const createInitialState = (
  input: CreateInitialStateInput,
): PreMulliganSetupGameState => {
  if (input.startOfGameSelections !== undefined) {
    throw new TypeError(
      "startOfGameSelections is deprecated; use canonical respondToDecision setup flow.",
    );
  }
  const cardManifestSnapshot = cloneMatchCardManifest(input.cardManifest);
  const [firstPlayerId, secondPlayerId] = input.playerOrder;
  if (firstPlayerId === secondPlayerId) {
    throw new TypeError("playerOrder must contain two distinct players.");
  }
  if (
    input.firstPlayerId !== firstPlayerId &&
    input.firstPlayerId !== secondPlayerId
  ) {
    throw new TypeError("firstPlayerId must exist in playerOrder.");
  }
  for (const playerId of input.playerOrder) {
    const lifeCount = requirePlayerValue(
      input.leaderLifeCounts,
      playerId,
      "leaderLifeCounts",
    );
    if (!Number.isInteger(lifeCount) || lifeCount < 0) {
      throw new TypeError(
        `leaderLifeCounts for ${playerId} must be a non-negative integer.`,
      );
    }
    const requiredDeckCards = OPENING_HAND_SIZE + lifeCount;
    const deckCardIds = requirePlayerValue(
      input.deckCardIds,
      playerId,
      "deckCardIds",
    );
    if (deckCardIds.length < requiredDeckCards) {
      throw new TypeError(
        `deckCardIds for ${playerId} must contain at least ${String(requiredDeckCards)} cards.`,
      );
    }
  }

  let rng = initializeRng(input.rngSeed);

  const firstPlayer = createPlayerState({
    playerId: firstPlayerId,
    deckCardIds: requirePlayerValue(
      input.deckCardIds,
      firstPlayerId,
      "deckCardIds",
    ),
    donDeckCardIds: requirePlayerValue(
      input.donDeckCardIds,
      firstPlayerId,
      "donDeckCardIds",
    ),
    leaderCardId: requirePlayerValue(
      input.leaderCardIds,
      firstPlayerId,
      "leaderCardIds",
    ),
    leaderLifeCount: requirePlayerValue(
      input.leaderLifeCounts,
      firstPlayerId,
      "leaderLifeCounts",
    ),
    shuffleDecks: input.shuffleDecks ?? false,
    rng,
    turnCount: input.firstPlayerId === firstPlayerId ? 1 : 0,
  });
  rng = firstPlayer.rng;

  const secondPlayer = createPlayerState({
    playerId: secondPlayerId,
    deckCardIds: requirePlayerValue(
      input.deckCardIds,
      secondPlayerId,
      "deckCardIds",
    ),
    donDeckCardIds: requirePlayerValue(
      input.donDeckCardIds,
      secondPlayerId,
      "donDeckCardIds",
    ),
    leaderCardId: requirePlayerValue(
      input.leaderCardIds,
      secondPlayerId,
      "leaderCardIds",
    ),
    leaderLifeCount: requirePlayerValue(
      input.leaderLifeCounts,
      secondPlayerId,
      "leaderLifeCounts",
    ),
    shuffleDecks: input.shuffleDecks ?? false,
    rng,
    turnCount: input.firstPlayerId === secondPlayerId ? 1 : 0,
  });
  rng = secondPlayer.rng;

  const status: SetupStatus = { type: "setup" };
  const state: PreMulliganSetupGameState = {
    matchId: input.matchId,
    status,
    version: {
      specVersion: "v6",
      rulesVersion: "r1",
      engineVersion: "engine-core",
      cardDataVersion: cardManifestSnapshot.cardDataVersion,
      effectDefinitionsVersion: cardManifestSnapshot.effectDefinitionsVersion,
      customHandlerVersion: cardManifestSnapshot.customHandlerVersion,
      banlistVersion: cardManifestSnapshot.banlistVersion,
    },
    seq: INITIAL_STATE_SEQ,
    actionSeq: 0,
    turn: {
      globalTurn: 1,
      playerTurnCounts: {
        [firstPlayerId]: firstPlayer.playerState.turnCount,
        [secondPlayerId]: secondPlayer.playerState.turnCount,
      },
      turnPlayerId: input.firstPlayerId,
      phase: "refresh",
    },
    cardManifest: cardManifestSnapshot,
    players: {
      [firstPlayerId]: firstPlayer.playerState,
      [secondPlayerId]: secondPlayer.playerState,
    },
    timers: {
      players: {
        [firstPlayerId]: {
          playerId: firstPlayerId,
          remainingMs: 0,
          isRunning: false,
        },
        [secondPlayerId]: {
          playerId: secondPlayerId,
          remainingMs: 0,
          isRunning: false,
        },
      },
    },
    oncePerTurn: [],
    effectQueue: [],
    effectExecutionFrames: [],
    deferredTriggers: [],
    continuousEffects: [],
    replacementState: [],
    revealedCards: [],
    rng,
    eventJournal: [],
    audit: [],
  };

  state.setupContinuation = {
    playerOrder: input.playerOrder,
    firstPlayerId: input.firstPlayerId,
    leaderLifeCounts: input.leaderLifeCounts,
    shuffleDecks: input.shuffleDecks ?? false,
    nextStartOfGamePlanIndex: 0,
  };

  const plansResult = collectStartOfGamePlans(
    state.players,
    state.cardManifest,
    input.playerOrder,
  );
  if (plansResult.errors !== undefined) {
    throw new TypeError(toEngineErrorReason(plansResult.errors[0]));
  }
  const plans = plansResult.plans;
  if (plans.length > 0) {
    const decision = createStartOfGameSetupDecision(
      state,
      plans,
      state.setupContinuation.nextStartOfGamePlanIndex,
    );
    if (decision.errors !== undefined) {
      throw new TypeError(toEngineErrorReason(decision.errors[0]));
    }
    if (decision.pendingDecision !== undefined) {
      state.pendingDecision = decision.pendingDecision;
      appendEvent(
        state,
        state.eventJournal,
        "decisionCreated",
        {
          decisionId: decision.pendingDecision.id,
          decisionType: decision.pendingDecision.type,
          playerId: decision.pendingDecision.playerId,
        },
        decision.pendingDecision.visibility,
      );
      return state;
    }
  }

  const finalized = finalizeSetupFromContinuation(state);

  assertGameStateInvariants(finalized);
  return finalized;
};
