import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  MatchCardManifest,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { createInitialState } from "./initial-state.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { resolvedCard } from "./action-test-fixtures.js";
import { applyStartOfGameEffects } from "./start-of-game-effects.js";
import { initializeRng } from "./rng.js";

const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toCardId = (value: string): CardId => value as CardId;

const p1 = toPlayerId("p1");
const p2 = toPlayerId("p2");
const must = <T>(value: T | undefined): T => {
  assert.ok(value !== undefined);
  return value;
};

const baseManifest = (): MatchCardManifest => ({
  manifestHash: "manifest-sog",
  source: "manual-test",
  cardDataVersion: "fixture",
  effectDefinitionsVersion: "fixture",
  customHandlerVersion: "fixture",
  banlistVersion: "fixture",
  createdAt: "2026-05-21T00:00:00.000Z",
  cards: (() => {
    const cards = {} as Record<CardId, ResolvedCard>;
    cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
      }),
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
    cards[toCardId("p1-stage")] = {
      ...resolvedCard({
        cardId: toCardId("p1-stage"),
        category: "stage",
      }),
      types: ["Navy"],
    };
    return cards;
  })(),
  effectDefinitions: {
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
  },
});

const createInput = () => ({
  matchId: "match-sog" as never,
  firstPlayerId: p1,
  rngSeed: "seed-sog",
  playerOrder: [p1, p2] as const,
  leaderCardIds: {
    [p1]: toCardId("leader-red"),
    [p2]: toCardId("leader-blue"),
  },
  leaderLifeCounts: { [p1]: 3, [p2]: 3 },
  deckCardIds: {
    [p1]: [
      "p1-stage",
      "p1-a",
      "p1-b",
      "p1-c",
      "p1-d",
      "p1-e",
      "p1-f",
      "p1-g",
      "p1-h",
      "p1-i",
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
    ].map(toCardId),
  },
  donDeckCardIds: {
    [p1]: ["p1-don-1", "p1-don-2"].map(toCardId),
    [p2]: ["p2-don-1", "p2-don-2"].map(toCardId),
  },
  cardManifest: baseManifest(),
  shuffleDecks: false,
});

test("selected Stage is placed before opening hand and life setup", () => {
  const input = createInput();
  const chosenId = "p1:deck:0:p1-stage" as never;
  const state = createInitialState({
    ...input,
    startOfGameSelections: [{ playerId: p1, selectedInstanceId: chosenId }],
  });
  assert.equal(must(state.players[p1]).stage?.cardId, toCardId("p1-stage"));
  assert.deepEqual(
    must(state.players[p1]).hand.map((card) => card.cardId),
    [
      toCardId("p1-a"),
      toCardId("p1-b"),
      toCardId("p1-c"),
      toCardId("p1-d"),
      toCardId("p1-e"),
    ],
  );
  assert.equal(
    must(state.players[p1]).life.some(
      (lifeCard) => lifeCard.card.cardId === toCardId("p1-stage"),
    ),
    false,
  );
  assert.equal(
    must(state.players[p1]).deck.some(
      (deckCard) => deckCard.cardId === toCardId("p1-stage"),
    ),
    false,
  );
});

test("zero selection is legal and deterministic", () => {
  const input = createInput();
  const a = createInitialState(input);
  const b = createInitialState(input);
  assert.equal(must(a.players[p1]).stage, undefined);
  assert.equal(hashCanonicalStateValue(a), hashCanonicalStateValue(b));
});

test("invalid, stale, malformed selection inputs fail closed", () => {
  const input = createInput();
  const unknownPlayer = () =>
    createInitialState({
      ...input,
      startOfGameSelections: [
        { playerId: p2, selectedInstanceId: "p1:deck:0:p1-stage" as never },
      ],
    });
  assert.throws(unknownPlayer, /selection player is invalid/);

  const duplicatePlayer = () =>
    createInitialState({
      ...input,
      startOfGameSelections: [
        { playerId: p1, selectedInstanceId: "p1:deck:0:p1-stage" as never },
        { playerId: p1, selectedInstanceId: "p1:deck:1:p1-a" as never },
      ],
    });
  assert.throws(duplicatePlayer, /duplicate selection/);

  const staleInstance = () =>
    createInitialState({
      ...input,
      startOfGameSelections: [
        { playerId: p1, selectedInstanceId: "p1:deck:999:missing" as never },
      ],
    });
  assert.throws(staleInstance, /selected card is invalid/);
});

test("type filter and deck position variation resolve through the same runtime path", () => {
  const inputA = createInput();
  inputA.deckCardIds[p1] = [
    "p1-a",
    "p1-b",
    "p1-stage",
    "p1-c",
    "p1-d",
    "p1-e",
    "p1-f",
    "p1-g",
    "p1-h",
    "p1-i",
  ].map(toCardId);
  const stateA = createInitialState({
    ...inputA,
    startOfGameSelections: [
      { playerId: p1, selectedInstanceId: "p1:deck:2:p1-stage" as never },
    ],
  });
  assert.equal(must(stateA.players[p1]).stage?.cardId, toCardId("p1-stage"));
  assert.equal(
    must(stateA.players[p1]).hand.some(
      (card) => card.cardId === toCardId("p1-stage"),
    ),
    false,
  );
});

test("no matching stage candidate keeps setup compatible and deterministic", () => {
  const input = createInput();
  input.deckCardIds[p1] = [
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
  ].map(toCardId);
  const state = createInitialState(input);
  assert.equal(must(state.players[p1]).stage, undefined);
  const replay = createInitialState(input);
  assert.equal(hashCanonicalStateValue(state), hashCanonicalStateValue(replay));
});

test("setup event visibility keeps owner-only decision with public played stage semantics", () => {
  const input = createInput();
  const seeded = createInitialState(input);
  const p1Player = must(seeded.players[p1]);
  const template = must(p1Player.deck[0]);
  const injectedStage = {
    ...template,
    cardId: toCardId("p1-stage"),
    instanceId: "p1:deck:0:p1-stage" as never,
    zone: {
      zone: "deck" as const,
      playerId: p1,
      slot: "deck" as const,
      index: 0,
    },
  };
  const injectedPlayers: typeof seeded.players = {
    ...seeded.players,
    [p1]: {
      ...p1Player,
      deck: [
        injectedStage,
        ...p1Player.deck.slice(1).map((card, index) => ({
          ...card,
          zone: {
            zone: "deck" as const,
            playerId: p1,
            slot: "deck" as const,
            index: index + 1,
          },
        })),
      ],
    },
  };
  const started = applyStartOfGameEffects({
    players: injectedPlayers,
    manifest: seeded.cardManifest,
    selections: [
      { playerId: p1, selectedInstanceId: "p1:deck:0:p1-stage" as never },
    ],
    rng: seeded.rng,
  });
  assert.equal(started.errors, undefined);
  const decisionResolved = must(
    started.events.find((event) => event.type === "decisionResolved"),
  );
  const cardMoved = must(
    started.events.find((event) => event.type === "cardMoved"),
  );
  const decisionCreated = must(
    started.events.find((event) => event.type === "decisionCreated"),
  );
  assert.equal(decisionCreated.visibility.type, "private");
  assert.equal(decisionResolved.visibility.type, "private");
  assert.equal(
    (decisionResolved.visibility as { playerId?: string }).playerId,
    p1,
  );
  assert.equal(cardMoved.visibility.type, "public");
});

test("occupied stage is trashed before selected setup stage placement", () => {
  const input = createInput();
  const seeded = createInitialState(input);
  const p1State = must(seeded.players[p1]);
  const injectedStage = {
    ...must(p1State.deck[0]),
    cardId: toCardId("p1-stage"),
    instanceId: "p1:deck:0:p1-stage" as never,
    zone: {
      zone: "deck" as const,
      playerId: p1,
      slot: "deck" as const,
      index: 0,
    },
  };
  const occupiedStage = {
    ...must(p1State.deck[1]),
    zone: {
      zone: "stageArea" as const,
      playerId: p1,
      slot: "stage" as const,
      index: 0,
    },
    attachedDon: [],
    state: "active" as const,
  };
  const withStage: {
    cardManifest: typeof seeded.cardManifest;
    players: typeof seeded.players;
    rng: typeof seeded.rng;
  } = {
    ...seeded,
    players: {
      ...seeded.players,
      [p1]: {
        ...p1State,
        deck: [
          injectedStage,
          ...p1State.deck.slice(1).map((card, index) => ({
            ...card,
            zone: {
              zone: "deck" as const,
              playerId: p1,
              slot: "deck" as const,
              index: index + 1,
            },
          })),
        ],
        stage: occupiedStage,
      },
    },
  };
  const started = applyStartOfGameEffects({
    players: withStage.players,
    manifest: withStage.cardManifest,
    selections: [
      { playerId: p1, selectedInstanceId: "p1:deck:0:p1-stage" as never },
    ],
    rng: withStage.rng,
  });
  assert.equal(started.errors, undefined);
  assert.equal(
    must(must(started.players[p1]).stage).cardId,
    toCardId("p1-stage"),
  );
  assert.equal(
    must(started.players[p1]).trash[0]?.cardId,
    occupiedStage.cardId,
  );
  assert.deepEqual(
    started.events.map((event) => event.type),
    [
      "decisionCreated",
      "cardTrashed",
      "decisionResolved",
      "cardMoved",
      "cardPlayed",
    ],
  );
});

test("invalid stage replacement state fails closed without mutation", () => {
  const input = createInput();
  const seeded = createInitialState(input);
  const p1State = must(seeded.players[p1]);
  const injectedStage = {
    ...must(p1State.deck[0]),
    cardId: toCardId("p1-stage"),
    instanceId: "p1:deck:0:p1-stage" as never,
    zone: {
      zone: "deck" as const,
      playerId: p1,
      slot: "deck" as const,
      index: 0,
    },
  };
  const occupiedStage = {
    ...must(p1State.deck[1]),
    zone: {
      zone: "stageArea" as const,
      playerId: p1,
      slot: "stage" as const,
      index: 0,
    },
    attachedDon: ["p1-don-attached" as never],
    state: "active" as const,
  };
  const withStage: {
    cardManifest: typeof seeded.cardManifest;
    players: typeof seeded.players;
    rng: typeof seeded.rng;
  } = {
    ...seeded,
    players: {
      ...seeded.players,
      [p1]: {
        ...p1State,
        deck: [
          injectedStage,
          ...p1State.deck.slice(1).map((card, index) => ({
            ...card,
            zone: {
              zone: "deck" as const,
              playerId: p1,
              slot: "deck" as const,
              index: index + 1,
            },
          })),
        ],
        stage: occupiedStage,
      },
    },
  };
  const before = hashCanonicalStateValue(must(withStage.players[p1]));
  const started = applyStartOfGameEffects({
    players: withStage.players,
    manifest: withStage.cardManifest,
    selections: [
      { playerId: p1, selectedInstanceId: "p1:deck:0:p1-stage" as never },
    ],
    rng: initializeRng("seed-sog"),
  });
  assert.equal(started.events.length, 0);
  assert.equal(started.errors?.[0]?.type, "invalidDecisionResponse");
  assert.equal(hashCanonicalStateValue(must(withStage.players[p1])), before);
});

test("valid occupied-stage replacement does not mutate input players object", () => {
  const input = createInput();
  const seeded = createInitialState(input);
  const p1State = must(seeded.players[p1]);
  const injectedStage = {
    ...must(p1State.deck[0]),
    cardId: toCardId("p1-stage"),
    instanceId: "p1:deck:0:p1-stage" as never,
    zone: {
      zone: "deck" as const,
      playerId: p1,
      slot: "deck" as const,
      index: 0,
    },
  };
  const occupiedStage = {
    ...must(p1State.deck[1]),
    zone: {
      zone: "stageArea" as const,
      playerId: p1,
      slot: "stage" as const,
      index: 0,
    },
    attachedDon: [],
    state: "active" as const,
  };
  const withStage: {
    cardManifest: typeof seeded.cardManifest;
    players: typeof seeded.players;
    rng: typeof seeded.rng;
  } = {
    ...seeded,
    players: {
      ...seeded.players,
      [p1]: {
        ...p1State,
        deck: [
          injectedStage,
          ...p1State.deck.slice(1).map((card, index) => ({
            ...card,
            zone: {
              zone: "deck" as const,
              playerId: p1,
              slot: "deck" as const,
              index: index + 1,
            },
          })),
        ],
        stage: occupiedStage,
      },
    },
  };
  const beforeInputHash = hashCanonicalStateValue(withStage.players);
  const started = applyStartOfGameEffects({
    players: withStage.players,
    manifest: withStage.cardManifest,
    selections: [
      { playerId: p1, selectedInstanceId: "p1:deck:0:p1-stage" as never },
    ],
    rng: withStage.rng,
  });
  assert.equal(started.errors, undefined);
  assert.equal(hashCanonicalStateValue(withStage.players), beforeInputHash);
});
