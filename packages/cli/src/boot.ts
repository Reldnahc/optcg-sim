import {
  createInitialState,
  hashCanonicalStateValue,
  startMulliganFlow,
} from "@optcg/engine-core";
import type {
  CardId,
  EngineResult,
  GameState,
  MatchCardManifest,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

export interface BootSummary {
  stateSeq: number;
  phase: GameState["turn"]["phase"];
  status: GameState["status"]["type"];
  hasPendingDecision: boolean;
  stateHash: string;
}

export interface BootFixtureMatchResult {
  state: GameState;
  stateHash: string;
  summary: BootSummary;
}

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const createdAt = "2026-05-04T00:00:00.000Z";

const toCardId = (value: string): CardId => value as CardId;

const fixtureCard = (params: {
  cardId: CardId;
  category: "leader" | "character" | "don";
  power?: number;
  life?: number;
}): ResolvedCard => ({
  cardId: params.cardId,
  language: "en",
  name: String(params.cardId),
  category: params.category,
  set: "CLI",
  setName: "CLI Fixtures",
  released: true,
  colors: ["red"],
  attributes: [],
  types: [],
  printedKeywords: [],
  variants: [],
  legality: {},
  officialFaq: [],
  errata: [],
  sourceTextHash: `source:${String(params.cardId)}`,
  behaviorHash: `behavior:${String(params.cardId)}`,
  support: {
    cardId: params.cardId,
    status: "vanilla-confirmed",
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: "cli-fixture",
    sourceTextHash: `source:${String(params.cardId)}`,
    behaviorHash: `behavior:${String(params.cardId)}`,
  },
  ...(params.power !== undefined ? { power: params.power } : {}),
  ...(params.life !== undefined ? { life: params.life } : {}),
});

const fixtureDeck = (prefix: string): CardId[] =>
  Array.from({ length: 12 }, (_, index) =>
    toCardId(`${prefix}-card-${String(index + 1)}`),
  );

const fixtureDonDeck = (prefix: string): CardId[] =>
  Array.from({ length: 10 }, (_, index) =>
    toCardId(`${prefix}-don-${String(index + 1)}`),
  );

const createFixtureManifest = (
  cardIds: readonly CardId[],
): MatchCardManifest => {
  const cards: Record<CardId, ResolvedCard> = {};
  for (const cardId of cardIds) {
    cards[cardId] = String(cardId).includes("-don-")
      ? fixtureCard({
          cardId,
          category: "don",
        })
      : fixtureCard({
          cardId,
          category: "character",
          power: 3000,
        });
  }

  cards[toCardId("p1-leader")] = fixtureCard({
    cardId: toCardId("p1-leader"),
    category: "leader",
    life: 5,
    power: 5000,
  });
  cards[toCardId("p2-leader")] = fixtureCard({
    cardId: toCardId("p2-leader"),
    category: "leader",
    life: 5,
    power: 5000,
  });

  return {
    manifestHash: "cli-fixture-manifest-v1",
    source: "manual-test",
    cardDataVersion: "cli-fixture",
    effectDefinitionsVersion: "cli-fixture",
    customHandlerVersion: "cli-fixture",
    banlistVersion: "cli-fixture",
    cards,
    createdAt,
  };
};

const describeEngineError = (
  error: NonNullable<EngineResult["errors"]>[number],
): string => {
  switch (error.type) {
    case "illegalAction":
    case "invalidDecisionResponse":
      return error.reason;
    case "invariantViolation":
      return error.invariant;
    case "unsupportedCard":
      return String(error.cardId);
    case "effectRuntimeError":
      return error.effectId;
    case "loopDetected":
      return JSON.stringify(error.signature);
  }
};

const assertSuccessfulEngineResult = (result: EngineResult): void => {
  if (result.errors !== undefined && result.errors.length > 0) {
    const firstError = result.errors[0];
    if (firstError === undefined) {
      throw new Error("CLI fixture boot failed with an unknown engine error.");
    }
    throw new Error(
      `CLI fixture boot failed: ${describeEngineError(firstError)}`,
    );
  }
};

const summarizeBootState = (
  state: GameState,
  stateHash: string,
): BootSummary => ({
  stateSeq: state.seq,
  phase: state.turn.phase,
  status: state.status.type,
  hasPendingDecision: state.pendingDecision !== undefined,
  stateHash,
});

export const bootFixtureMatch = (): BootFixtureMatchResult => {
  const p1Deck = fixtureDeck("p1");
  const p2Deck = fixtureDeck("p2");
  const p1DonDeck = fixtureDonDeck("p1");
  const p2DonDeck = fixtureDonDeck("p2");
  const allCardIds = [...p1Deck, ...p2Deck, ...p1DonDeck, ...p2DonDeck];

  const setupState = createInitialState({
    matchId: "cli-fixture-match" as MatchId,
    firstPlayerId: p1,
    rngSeed: "cli-fixture-seed",
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: toCardId("p1-leader"),
      [p2]: toCardId("p2-leader"),
    },
    leaderLifeCounts: {
      [p1]: 5,
      [p2]: 5,
    },
    deckCardIds: {
      [p1]: p1Deck,
      [p2]: p2Deck,
    },
    donDeckCardIds: {
      [p1]: p1DonDeck,
      [p2]: p2DonDeck,
    },
    cardManifest: createFixtureManifest(allCardIds),
    shuffleDecks: false,
  });
  const started = startMulliganFlow(setupState);
  assertSuccessfulEngineResult(started);

  const stateHash = hashCanonicalStateValue(started.state);
  return {
    state: started.state,
    stateHash,
    summary: summarizeBootState(started.state, stateHash),
  };
};
