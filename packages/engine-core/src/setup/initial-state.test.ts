import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardId, MatchId, PlayerId } from "@optcg/types";

import { assertGameStateInvariants } from "../state/invariants.js";
import { createInitialState } from "./initial-state.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import type { PreMulliganSetupGameState } from "./initial-state.js";

const toMatchId = (value: string): MatchId => value as MatchId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toCardId = (value: string): CardId => value as CardId;

const p1 = toPlayerId("p1");
const p2 = toPlayerId("p2");

const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

const createInput = () => ({
  matchId: toMatchId("match-1"),
  firstPlayerId: p1,
  rngSeed: "seed-1",
  playerOrder: [p1, p2] as const,
  leaderCardIds: {
    [p1]: toCardId("leader-red"),
    [p2]: toCardId("leader-blue"),
  },
  leaderLifeCounts: {
    [p1]: 5,
    [p2]: 5,
  },
  deckCardIds: {
    [p1]: [
      "p1-a",
      "p1-b",
      "p1-c",
      "p1-d",
      "p1-e",
      "p1-f",
      "p1-g",
      "p1-h",
      "p1-i",
      "p1-j",
      "p1-k",
      "p1-l",
    ].map(toCardId),
    [p2]: [
      "p2-a",
      "p2-b",
      "p2-c",
      "p2-d",
      "p2-e",
      "p2-f",
      "p2-g",
      "p2-h",
      "p2-i",
      "p2-j",
      "p2-k",
      "p2-l",
    ].map(toCardId),
  },
  donDeckCardIds: {
    [p1]: ["p1-don-1", "p1-don-2", "p1-don-3"].map(toCardId),
    [p2]: ["p2-don-1", "p2-don-2", "p2-don-3"].map(toCardId),
  },
  cardManifest: {
    manifestHash: "manifest-initial-state-1",
    source: "manual-test" as const,
    cardDataVersion: "fixture",
    effectDefinitionsVersion: "fixture",
    customHandlerVersion: "fixture",
    banlistVersion: "fixture",
    createdAt: "2026-05-04T00:00:00.000Z",
    cards: {},
  },
  shuffleDecks: false,
});

test("repeated pre-mulligan setup with same input and seed produces the same hash", () => {
  const input = createInput();
  const a = createInitialState(input);
  const b = createInitialState(input);
  assert.equal(hashCanonicalStateValue(a), hashCanonicalStateValue(b));
});

test("different explicit deck order changes resulting state hash", () => {
  const inputA = createInput();
  const inputB = createInput();
  inputB.deckCardIds[p1] = [
    ...must(inputB.deckCardIds[p1], "p1 deck"),
  ].reverse();

  const a = createInitialState(inputA);
  const b = createInitialState(inputB);
  assert.notEqual(hashCanonicalStateValue(a), hashCanonicalStateValue(b));
});

test("opening hands and remaining deck order match deterministic setup policy", () => {
  const input = createInput();
  const state = createInitialState(input);

  const p1State = must(state.players[p1], "p1 state");
  assert.deepEqual(
    p1State.hand.map((card) => card.cardId),
    must(input.deckCardIds[p1], "p1 deck").slice(0, 5),
  );
  assert.deepEqual(
    p1State.deck.map((card) => card.cardId),
    must(input.deckCardIds[p1], "p1 deck").slice(5),
  );
});

test("life is not placed before official mulligan decisions resolve", () => {
  const input = createInput();
  const state = createInitialState(input);
  const p1State = must(state.players[p1], "p1 state");

  assert.equal(p1State.life.length, 0);
  assert.deepEqual(
    p1State.deck.map((card) => card.cardId),
    must(input.deckCardIds[p1], "p1 deck").slice(5),
  );
});

test("life count input is retained for post-mulligan setup without placing life early", () => {
  const input = createInput();
  input.leaderLifeCounts[p1] = 3;
  const state = createInitialState(input);
  const p1State = must(state.players[p1], "p1 state");
  assert.equal(p1State.life.length, 0);
  assert.equal(state.setupContinuation?.leaderLifeCounts[p1], 3);
  assert.deepEqual(
    p1State.deck.map((card) => card.cardId),
    must(input.deckCardIds[p1], "p1 deck").slice(5),
  );
});

test("shuffleDecks uses deterministic RNG and changes order from unshuffled setup", () => {
  const base = createInput();
  const shuffledInputA = { ...createInput(), shuffleDecks: true };
  const shuffledInputB = { ...createInput(), shuffleDecks: true };
  const unshuffled = createInitialState(base);
  const shuffledA = createInitialState(shuffledInputA);
  const shuffledB = createInitialState(shuffledInputB);
  const p1Unshuffled = must(unshuffled.players[p1], "p1 unshuffled");
  const p1ShuffledA = must(shuffledA.players[p1], "p1 shuffled a");
  const p1ShuffledB = must(shuffledB.players[p1], "p1 shuffled b");

  assert.deepEqual(
    p1ShuffledA.hand.map((card) => card.cardId),
    p1ShuffledB.hand.map((card) => card.cardId),
  );
  assert.deepEqual(
    p1ShuffledA.deck.map((card) => card.cardId),
    p1ShuffledB.deck.map((card) => card.cardId),
  );
  assert.notDeepEqual(
    p1ShuffledA.hand.map((card) => card.cardId),
    p1Unshuffled.hand.map((card) => card.cardId),
  );
});

test("setup state passes ENG-002A invariants", () => {
  const state = createInitialState(createInput());
  assert.doesNotThrow(() => {
    assertGameStateInvariants(state);
  });
});

test("setup snapshots the provided deterministic card manifest", () => {
  const input = createInput();
  const state = createInitialState(input);
  assert.deepEqual(state.cardManifest, input.cardManifest);
});

test("setup stores an immutable snapshot of the provided manifest data", () => {
  const input = createInput();
  const state = createInitialState(input);

  input.cardManifest.manifestHash = "mutated-manifest-hash";
  input.cardManifest.cardDataVersion = "mutated-card-data-version";

  assert.equal(state.cardManifest.manifestHash, "manifest-initial-state-1");
  assert.equal(state.cardManifest.cardDataVersion, "fixture");
});

test("setup version mirrors manifest versions for deterministic match snapshots", () => {
  const input = createInput();
  input.cardManifest.cardDataVersion = "cards-v9";
  input.cardManifest.effectDefinitionsVersion = "effects-v9";
  input.cardManifest.customHandlerVersion = "handlers-v9";
  input.cardManifest.banlistVersion = "banlist-v9";

  const state = createInitialState(input);
  assert.equal(state.version.cardDataVersion, "cards-v9");
  assert.equal(state.version.effectDefinitionsVersion, "effects-v9");
  assert.equal(state.version.customHandlerVersion, "handlers-v9");
  assert.equal(state.version.banlistVersion, "banlist-v9");
});

test("returned setup output is type-level documented as pre-mulligan setup status", () => {
  const state: PreMulliganSetupGameState = createInitialState(createInput());
  assert.equal(state.status.type, "setup");
});

test("start-of-game setup branch enters canonical pending decision flow", () => {
  const input = createInput();
  const manifest = input.cardManifest as {
    cards: Record<CardId, unknown>;
    effectDefinitions?: Record<string, unknown>;
  };
  manifest.cards[toCardId("leader-red")] = {
    cardId: toCardId("leader-red"),
    language: "en",
    name: "Leader Red",
    category: "leader",
    set: "TEST",
    setName: "Test",
    released: true,
    colors: ["red"],
    attributes: [],
    types: ["Leader"],
    printedKeywords: [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash: "leader-red-sog",
    behaviorHash: "leader-red-sog",
    support: {
      status: "implemented-dsl",
      cardId: toCardId("leader-red"),
      effectDefinitionId: "leader-red-sog",
      tested: true,
      rulesVersion: "r1",
      sourceTextHash: "leader-red-sog",
      behaviorHash: "leader-red-sog",
      cardDataVersion: "fixture",
    },
  };
  manifest.cards[toCardId("p1-a")] = {
    cardId: toCardId("p1-a"),
    language: "en",
    name: "Setup Stage",
    category: "stage",
    set: "TEST",
    setName: "Test",
    released: true,
    colors: ["red"],
    attributes: [],
    types: ["Navy"],
    printedKeywords: [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash: "p1-a-source",
    behaviorHash: "p1-a-behavior",
    support: {
      status: "vanilla-confirmed",
      cardId: toCardId("p1-a"),
      tested: true,
      rulesVersion: "r1",
      sourceTextHash: "p1-a-source",
      behaviorHash: "p1-a-behavior",
      cardDataVersion: "fixture",
    },
  };
  manifest.effectDefinitions = {
    "leader-red-sog": {
      cardId: toCardId("leader-red"),
      implementationStatus: "implemented-dsl",
      metadata: {
        sourceTextHash: "leader-red-sog",
        rulesVersion: "r1",
        effectDefinitionsVersion: "fixture",
        tested: true,
        reviewedBy: "test",
        reviewedAt: "2026-05-21T00:00:00.000Z",
      },
      effects: [
        {
          id: "leader-red:start-of-game-stage" as never,
          category: "auto",
          trigger: { type: "startOfGame" },
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "search",
                  request: {
                    zone: "deck",
                    player: "self",
                    filter: { categories: ["stage"], typesAny: ["Navy"] },
                    min: 0,
                    max: 1,
                    destination: "stageArea",
                    revealTo: "chooserOnly",
                    shuffleAfter: false,
                  },
                },
              },
              {
                connector: "always",
                effect: {
                  type: "playSelected",
                  selection: "selected:start-of-game" as never,
                  ignoreCost: true,
                },
              },
            ],
          },
        },
      ],
    },
  };
  const selected = createInitialState(input);
  const replay = createInitialState(input);
  assert.equal(
    hashCanonicalStateValue(selected),
    hashCanonicalStateValue(replay),
  );
  assert.equal(selected.status.type, "setup");
  assert.equal(selected.pendingDecision?.type, "selectCards");
  assert.equal(selected.pendingDecision.playerId, p1);
  assert.equal(selected.setupContinuation?.nextStartOfGamePlanIndex, 0);
});

test("zero-selection setup branch with no matching candidate finalizes deterministically", () => {
  const input = createInput();
  const manifest = input.cardManifest as {
    cards: Record<CardId, unknown>;
    effectDefinitions?: Record<string, unknown>;
  };
  manifest.cards[toCardId("leader-red")] = {
    cardId: toCardId("leader-red"),
    language: "en",
    name: "Leader Red",
    category: "leader",
    set: "TEST",
    setName: "Test",
    released: true,
    colors: ["red"],
    attributes: [],
    types: ["Leader"],
    printedKeywords: [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash: "leader-red-sog",
    behaviorHash: "leader-red-sog",
    support: {
      status: "implemented-dsl",
      cardId: toCardId("leader-red"),
      effectDefinitionId: "leader-red-sog",
      tested: true,
      rulesVersion: "r1",
      sourceTextHash: "leader-red-sog",
      behaviorHash: "leader-red-sog",
      cardDataVersion: "fixture",
    },
  };
  manifest.effectDefinitions = {
    "leader-red-sog": {
      cardId: toCardId("leader-red"),
      implementationStatus: "implemented-dsl",
      metadata: {
        sourceTextHash: "leader-red-sog",
        rulesVersion: "r1",
        effectDefinitionsVersion: "fixture",
        tested: true,
        reviewedBy: "test",
        reviewedAt: "2026-05-21T00:00:00.000Z",
      },
      effects: [
        {
          id: "leader-red:start-of-game-stage" as never,
          category: "auto",
          trigger: { type: "startOfGame" },
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "search",
                  request: {
                    zone: "deck",
                    player: "self",
                    filter: { categories: ["stage"], typesAny: ["Navy"] },
                    min: 0,
                    max: 1,
                    destination: "stageArea",
                    revealTo: "chooserOnly",
                    shuffleAfter: false,
                  },
                },
              },
              {
                connector: "always",
                effect: {
                  type: "playSelected",
                  selection: "selected:start-of-game" as never,
                  ignoreCost: true,
                },
              },
            ],
          },
        },
      ],
    },
  };

  const a = createInitialState(input);
  const b = createInitialState(input);
  assert.equal(hashCanonicalStateValue(a), hashCanonicalStateValue(b));
  assert.equal(a.pendingDecision, undefined);
  assert.equal(a.setupContinuation?.leaderLifeCounts[p1], 5);
  assert.deepEqual(a.eventJournal, []);
});

test("fails closed for invalid leaderLifeCounts input", () => {
  const missing = createInput();
  const missingInput = {
    ...missing,
    leaderLifeCounts: { [p1]: 5 } as Record<PlayerId, number>,
  };
  assert.throws(
    () => createInitialState(missingInput),
    /Missing leaderLifeCounts/,
  );

  const negative = createInput();
  negative.leaderLifeCounts[p1] = -1;
  assert.throws(() => createInitialState(negative), /non-negative integer/);

  const nonInteger = createInput();
  nonInteger.leaderLifeCounts[p1] = 2.5;
  assert.throws(() => createInitialState(nonInteger), /non-negative integer/);
});

test("fails closed when playerOrder contains duplicate player ids", () => {
  const duplicatePlayers = {
    ...createInput(),
    playerOrder: [p1, p1] as const,
  };
  assert.throws(
    () => createInitialState(duplicatePlayers),
    /playerOrder must contain two distinct players/,
  );
});

test("fails closed when deck cannot satisfy opening hand plus life setup", () => {
  const shortDeck = createInput();
  shortDeck.leaderLifeCounts[p1] = 5;
  shortDeck.deckCardIds[p1] = must(shortDeck.deckCardIds[p1], "p1 deck").slice(
    0,
    9,
  );
  assert.throws(
    () => createInitialState(shortDeck),
    /deckCardIds for p1 must contain at least 10 cards/,
  );
});

test("rejects deprecated raw startOfGameSelections setup bypass input", () => {
  const input = createInput();
  const manifest = input.cardManifest as {
    cards: Record<CardId, unknown>;
    effectDefinitions?: Record<string, unknown>;
  };
  manifest.cards[toCardId("leader-red")] = {
    cardId: toCardId("leader-red"),
    language: "en",
    name: "Leader Red",
    category: "leader",
    set: "TEST",
    setName: "Test",
    released: true,
    colors: ["red"],
    attributes: [],
    types: ["Leader"],
    printedKeywords: [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash: "leader-red-sog",
    behaviorHash: "leader-red-sog",
    support: {
      status: "implemented-dsl",
      cardId: toCardId("leader-red"),
      effectDefinitionId: "leader-red-sog",
      tested: true,
      rulesVersion: "r1",
      sourceTextHash: "leader-red-sog",
      behaviorHash: "leader-red-sog",
      cardDataVersion: "fixture",
    },
  };
  manifest.cards[toCardId("p1-a")] = {
    cardId: toCardId("p1-a"),
    language: "en",
    name: "Setup Stage",
    category: "stage",
    set: "TEST",
    setName: "Test",
    released: true,
    colors: ["red"],
    attributes: [],
    types: ["Navy"],
    printedKeywords: [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash: "p1-a-source",
    behaviorHash: "p1-a-behavior",
    support: {
      status: "vanilla-confirmed",
      cardId: toCardId("p1-a"),
      tested: true,
      rulesVersion: "r1",
      sourceTextHash: "p1-a-source",
      behaviorHash: "p1-a-behavior",
      cardDataVersion: "fixture",
    },
  };
  manifest.effectDefinitions = {
    "leader-red-sog": {
      cardId: toCardId("leader-red"),
      implementationStatus: "implemented-dsl",
      metadata: {
        sourceTextHash: "leader-red-sog",
        rulesVersion: "r1",
        effectDefinitionsVersion: "fixture",
        tested: true,
        reviewedBy: "test",
        reviewedAt: "2026-05-21T00:00:00.000Z",
      },
      effects: [
        {
          id: "leader-red:start-of-game-stage" as never,
          category: "auto",
          trigger: { type: "startOfGame" },
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "search",
                  request: {
                    zone: "deck",
                    player: "self",
                    filter: { categories: ["stage"], typesAny: ["Navy"] },
                    min: 0,
                    max: 1,
                    destination: "stageArea",
                    revealTo: "chooserOnly",
                    shuffleAfter: false,
                  },
                },
              },
              {
                connector: "always",
                effect: {
                  type: "playSelected",
                  selection: "selected:start-of-game" as never,
                  ignoreCost: true,
                },
              },
            ],
          },
        },
      ],
    },
  };
  assert.throws(
    () =>
      createInitialState({
        ...input,
        startOfGameSelections: [
          { playerId: p1, selectedInstanceId: "p1:deck:0:p1-a" as never },
        ],
      }),
    /deprecated|unsupported|invalid/i,
  );
});
