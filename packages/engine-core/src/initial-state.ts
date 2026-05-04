import type {
  CardId,
  CardInstance,
  GameState,
  MatchId,
  PlayerId,
  PlayerState,
  RngState,
  StateSeq,
} from "@optcg/types";

import { assertGameStateInvariants } from "./invariants.js";
import { advanceRngUint32, initializeRng } from "./rng.js";

const OPENING_HAND_SIZE = 5;
const INITIAL_STATE_SEQ = 0 as StateSeq;

type SetupStatus = Extract<GameState["status"], { type: "setup" }>;

export type PreMulliganSetupGameState = GameState & { status: SetupStatus };

export interface CreateInitialStateInput {
  matchId: MatchId;
  playerOrder: readonly [PlayerId, PlayerId];
  firstPlayerId: PlayerId;
  deckCardIds: Record<PlayerId, CardId[]>;
  donDeckCardIds: Record<PlayerId, CardId[]>;
  leaderCardIds: Record<PlayerId, CardId>;
  leaderLifeCounts: Record<PlayerId, number>;
  rngSeed: number | bigint | string;
  shuffleDecks?: boolean;
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

  const shuffledDeck = params.shuffleDecks
    ? shuffleCardsDeterministic(seededDeck, params.rng)
    : { cards: seededDeck, rng: params.rng };

  const openingHand = shuffledDeck.cards
    .slice(0, OPENING_HAND_SIZE)
    .map((card, index) => withIndexedZone(card, "hand", "hand", index));
  const afterHandDeck = shuffledDeck.cards.slice(OPENING_HAND_SIZE);
  const lifeSetup = setupLifeFromDeck(
    params.playerId,
    afterHandDeck,
    params.leaderLifeCount,
  );
  const finalDeck = lifeSetup.deck.map((card, index) =>
    withIndexedZone(card, "deck", "deck", index),
  );

  return {
    playerState: {
      playerId: params.playerId,
      deck: finalDeck,
      donDeck: seededDonDeck,
      hand: openingHand,
      trash: [],
      leader,
      characters: [],
      costArea: [],
      life: lifeSetup.life,
      hasMulliganed: false,
      turnCount: params.turnCount,
    },
    rng: shuffledDeck.rng,
  };
};

/**
 * Creates authoritative deterministic setup output before official mulligan.
 */
export const createInitialState = (
  input: CreateInitialStateInput,
): PreMulliganSetupGameState => {
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
      cardDataVersion: "fixture",
      effectDefinitionsVersion: "fixture",
      customHandlerVersion: "fixture",
      banlistVersion: "fixture",
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
    deferredTriggers: [],
    continuousEffects: [],
    replacementState: [],
    revealedCards: [],
    rng,
    eventJournal: [],
    audit: [],
  };

  assertGameStateInvariants(state);
  return state;
};
