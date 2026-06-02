import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  GameState,
  InstanceId,
  MatchId,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import {
  consumeOncePerTurn,
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "./once-per-turn.js";

const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toCardId = (value: string): CardId => value as CardId;
const toMatchId = (value: string): MatchId => value as MatchId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;

const createState = (): GameState => {
  const p1 = toPlayerId("p1");
  const p2 = toPlayerId("p2");
  return {
    matchId: toMatchId("m1"),
    status: { type: "active" },
    version: {
      specVersion: "v6",
      rulesVersion: "r1",
      engineVersion: "e1",
      cardDataVersion: "c1",
      effectDefinitionsVersion: "d1",
      customHandlerVersion: "h1",
      banlistVersion: "b1",
    },
    seq: toStateSeq(7),
    actionSeq: 1,
    turn: {
      globalTurn: 2,
      playerTurnCounts: { [p1]: 1, [p2]: 1 },
      turnPlayerId: p1,
      phase: "main",
    },
    cardManifest: {
      manifestHash: "manifest-once-per-turn",
      source: "manual-test",
      cardDataVersion: "fixture",
      effectDefinitionsVersion: "fixture",
      customHandlerVersion: "fixture",
      banlistVersion: "fixture",
      createdAt: "2026-05-11T00:00:00.000Z",
      cards: {},
    },
    players: {
      [p1]: {
        playerId: p1,
        deck: [],
        donDeck: [],
        hand: [],
        trash: [],
        leader: {
          instanceId: toInstanceId("p1-leader"),
          cardId: toCardId("leader-1"),
          owner: p1,
          controller: p1,
          zone: { zone: "leaderArea", playerId: p1, slot: "leader" },
          attachedDon: [],
        },
        characters: [],
        costArea: [],
        life: [],
        hasMulliganed: false,
        turnCount: 1,
      },
      [p2]: {
        playerId: p2,
        deck: [],
        donDeck: [],
        hand: [],
        trash: [],
        leader: {
          instanceId: toInstanceId("p2-leader"),
          cardId: toCardId("leader-2"),
          owner: p2,
          controller: p2,
          zone: { zone: "leaderArea", playerId: p2, slot: "leader" },
          attachedDon: [],
        },
        characters: [],
        costArea: [],
        life: [],
        hasMulliganed: false,
        turnCount: 1,
      },
    },
    timers: {
      players: {
        [p1]: { playerId: p1, remainingMs: 1000, isRunning: true },
        [p2]: { playerId: p2, remainingMs: 1000, isRunning: false },
      },
      drainingPlayerId: p1,
    },
    oncePerTurn: [],
    effectQueue: [],
    effectExecutionFrames: [],
    deferredTriggers: [],
    continuousEffects: [],
    replacementState: [],
    revealedCards: [],
    rng: { algorithm: "test-fixed", internalState: "0", callCount: 0 },
    eventJournal: [],
    audit: [],
  };
};

test("isOncePerTurnUsed keys by card instance id + effect id + turn number", () => {
  const state = createState();
  state.oncePerTurn.push({
    cardInstanceId: toInstanceId("card-1"),
    effectId: "effect-a",
    turnNumber: 3,
    usedAtStateSeq: toStateSeq(10),
  });

  assert.equal(
    isOncePerTurnUsed(
      state,
      toOncePerTurnKey({
        cardInstanceId: toInstanceId("card-1"),
        effectId: "effect-a",
        turnNumber: 3,
      }),
    ),
    true,
  );
  assert.equal(
    isOncePerTurnUsed(
      state,
      toOncePerTurnKey({
        cardInstanceId: toInstanceId("card-1"),
        effectId: "effect-b",
        turnNumber: 3,
      }),
    ),
    false,
  );
  assert.equal(
    isOncePerTurnUsed(
      state,
      toOncePerTurnKey({
        cardInstanceId: toInstanceId("card-2"),
        effectId: "effect-a",
        turnNumber: 3,
      }),
    ),
    false,
  );
});

test("isOncePerTurnUsed does not treat prior-turn record as used", () => {
  const state = createState();
  state.oncePerTurn.push({
    cardInstanceId: toInstanceId("card-1"),
    effectId: "effect-a",
    turnNumber: 2,
    usedAtStateSeq: toStateSeq(5),
  });

  assert.equal(
    isOncePerTurnUsed(
      state,
      toOncePerTurnKey({
        cardInstanceId: toInstanceId("card-1"),
        effectId: "effect-a",
        turnNumber: 3,
      }),
    ),
    false,
  );
});

test("consumeOncePerTurn appends one immutable record with stable usedAtStateSeq", () => {
  const state = createState();
  const next = consumeOncePerTurn(
    state,
    toOncePerTurnKey({
      cardInstanceId: toInstanceId("card-1"),
      effectId: "effect-a",
      turnNumber: 3,
    }),
  );

  assert.notEqual(next, state);
  assert.equal(state.oncePerTurn.length, 0);
  assert.equal(next.oncePerTurn.length, 1);
  assert.deepEqual(next.oncePerTurn[0], {
    cardInstanceId: toInstanceId("card-1"),
    effectId: "effect-a",
    turnNumber: 3,
    usedAtStateSeq: toStateSeq(7),
  });
});

test("consumeOncePerTurn is idempotent for the same key and preserves prior-turn records", () => {
  const state = createState();
  state.oncePerTurn.push({
    cardInstanceId: toInstanceId("card-1"),
    effectId: "effect-a",
    turnNumber: 2,
    usedAtStateSeq: toStateSeq(2),
  });

  const key = toOncePerTurnKey({
    cardInstanceId: toInstanceId("card-1"),
    effectId: "effect-a",
    turnNumber: 3,
  });
  const once = consumeOncePerTurn(state, key);
  const twice = consumeOncePerTurn(once, key);

  assert.equal(once.oncePerTurn.length, 2);
  assert.equal(twice.oncePerTurn.length, 2);
  const matches = twice.oncePerTurn.filter(
    (record) =>
      record.cardInstanceId === key.cardInstanceId &&
      record.effectId === key.effectId &&
      record.turnNumber === key.turnNumber,
  );
  assert.equal(matches.length, 1);
  assert.equal(
    twice.oncePerTurn.some(
      (record) => record.turnNumber === 2 && record.effectId === "effect-a",
    ),
    true,
  );
});
