import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  GameState,
  InstanceId,
  MatchId,
  PlayerId,
  PlayerState,
  StateSeq,
} from "@optcg/types";

import {
  assertGameStateInvariants,
  collectGameStateInvariantViolations,
  GameStateInvariantError,
} from "./invariants.js";

const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toCardId = (value: string): CardId => value as CardId;
const toMatchId = (value: string): MatchId => value as MatchId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;

const createCardInstance = (params: {
  instanceId: string;
  cardId: string;
  owner: string;
  controller: string;
  zone: CardInstance["zone"];
  attachedDon?: string[];
}): CardInstance => {
  const card = {
    instanceId: toInstanceId(params.instanceId),
    cardId: toCardId(params.cardId),
    owner: toPlayerId(params.owner),
    controller: toPlayerId(params.controller),
    zone: params.zone,
    attachedDon: (params.attachedDon ?? []).map(toInstanceId),
  } satisfies CardInstance;
  return card;
};

const getPlayer = (state: GameState, playerId: string): PlayerState => {
  const player = state.players[toPlayerId(playerId)];
  assert.ok(player !== undefined, `missing player ${playerId}`);
  return player;
};

const createBaseState = (): GameState => {
  const p1 = toPlayerId("p1");
  const p2 = toPlayerId("p2");

  const state = {
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
    seq: toStateSeq(1),
    actionSeq: 1,
    turn: {
      globalTurn: 1,
      playerTurnCounts: { [p1]: 1, [p2]: 0 },
      turnPlayerId: p1,
      phase: "main",
    },
    players: {
      [p1]: {
        playerId: p1,
        deck: [],
        donDeck: [],
        hand: [],
        trash: [],
        leader: createCardInstance({
          instanceId: "p1-leader",
          cardId: "leader-1",
          owner: "p1",
          controller: "p1",
          zone: { zone: "leaderArea", playerId: p1, slot: "leader" },
        }),
        characters: [],
        costArea: [],
        life: [
          {
            card: createCardInstance({
              instanceId: "p1-life-1",
              cardId: "life-1",
              owner: "p1",
              controller: "p1",
              zone: { zone: "life", playerId: p1, slot: "life", index: 0 },
            }),
            faceUp: false,
          },
        ],
        hasMulliganed: false,
        turnCount: 1,
      },
      [p2]: {
        playerId: p2,
        deck: [],
        donDeck: [],
        hand: [],
        trash: [],
        leader: createCardInstance({
          instanceId: "p2-leader",
          cardId: "leader-2",
          owner: "p2",
          controller: "p2",
          zone: { zone: "leaderArea", playerId: p2, slot: "leader" },
        }),
        characters: [],
        costArea: [],
        life: [
          {
            card: createCardInstance({
              instanceId: "p2-life-1",
              cardId: "life-2",
              owner: "p2",
              controller: "p2",
              zone: { zone: "life", playerId: p2, slot: "life", index: 0 },
            }),
            faceUp: false,
          },
        ],
        hasMulliganed: false,
        turnCount: 0,
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
    deferredTriggers: [],
    continuousEffects: [],
    replacementState: [],
    revealedCards: [],
    rng: {
      algorithm: "test-fixed",
      internalState: "0",
      callCount: 0,
    },
    eventJournal: [],
    audit: [],
  } satisfies GameState;

  return state;
};

test("valid minimal state fixture passes invariant checks", () => {
  const state = createBaseState();
  assert.deepEqual(collectGameStateInvariantViolations(state), []);
  assert.doesNotThrow(() => {
    assertGameStateInvariants(state);
  });
});

test("duplicate zone placement fails with stable invariant name", () => {
  const state = createBaseState();
  const duplicate = {
    ...getPlayer(state, "p1").leader,
    zone: {
      zone: "characterArea",
      playerId: toPlayerId("p1"),
      slot: "character",
      index: 0,
    },
  } satisfies CardInstance;
  getPlayer(state, "p1").characters.push(duplicate);

  const violations = collectGameStateInvariantViolations(state);
  assert.ok(
    violations.some(
      (violation) => violation.invariant === "cards.exactlyOneLocation",
    ),
  );
});

test("invalid attached DON!! ownership or missing attached instance fails with stable invariant name", () => {
  const state = createBaseState();
  const hostileDon = createCardInstance({
    instanceId: "p2-don-1",
    cardId: "don-1",
    owner: "p2",
    controller: "p2",
    zone: {
      zone: "costArea",
      playerId: toPlayerId("p2"),
      slot: "cost",
      index: 0,
    },
  });
  getPlayer(state, "p2").costArea.push(hostileDon);
  getPlayer(state, "p1").leader.attachedDon.push(toInstanceId("p2-don-1"));
  getPlayer(state, "p2").leader.attachedDon.push(toInstanceId("missing-don"));

  const violations = collectGameStateInvariantViolations(state);
  assert.ok(
    violations.some(
      (violation) => violation.invariant === "cards.attachedDonOwnership",
    ),
  );
  assert.ok(
    violations.some(
      (violation) => violation.invariant === "cards.attachedDonExists",
    ),
  );
});

test("valid attached DON state passes with one backing instance and one legal host reference", () => {
  const state = createBaseState();
  const attachedDon = createCardInstance({
    instanceId: "p1-don-1",
    cardId: "don-1",
    owner: "p1",
    controller: "p1",
    zone: {
      zone: "costArea",
      playerId: toPlayerId("p1"),
      slot: "cost",
      index: 0,
    },
  });
  getPlayer(state, "p1").costArea.push(attachedDon);
  getPlayer(state, "p1").leader.attachedDon.push(toInstanceId("p1-don-1"));

  const violations = collectGameStateInvariantViolations(state);
  assert.equal(
    violations.some((violation) => violation.invariant.startsWith("cards.")),
    false,
  );
  assert.doesNotThrow(() => {
    assertGameStateInvariants(state);
  });
});

test("attached DON hosted by illegal host zone fails with stable invariant name", () => {
  const state = createBaseState();
  const attachedDon = createCardInstance({
    instanceId: "p1-don-2",
    cardId: "don-2",
    owner: "p1",
    controller: "p1",
    zone: {
      zone: "costArea",
      playerId: toPlayerId("p1"),
      slot: "cost",
      index: 0,
    },
  });
  getPlayer(state, "p1").costArea.push(attachedDon);
  getPlayer(state, "p1").stage = createCardInstance({
    instanceId: "p1-stage-1",
    cardId: "stage-1",
    owner: "p1",
    controller: "p1",
    zone: { zone: "stageArea", playerId: toPlayerId("p1"), slot: "stage" },
    attachedDon: ["p1-don-2"],
  });

  const violations = collectGameStateInvariantViolations(state);
  assert.ok(
    violations.some(
      (violation) => violation.invariant === "cards.attachedDonLegalHost",
    ),
  );
});

test("attached DON controller mismatch fails", () => {
  const state = createBaseState();
  const attachedDon = createCardInstance({
    instanceId: "p1-don-3",
    cardId: "don-3",
    owner: "p1",
    controller: "p2",
    zone: {
      zone: "costArea",
      playerId: toPlayerId("p1"),
      slot: "cost",
      index: 0,
    },
  });
  getPlayer(state, "p1").costArea.push(attachedDon);
  getPlayer(state, "p1").leader.attachedDon.push(toInstanceId("p1-don-3"));

  const violations = collectGameStateInvariantViolations(state);
  assert.ok(
    violations.some(
      (violation) => violation.invariant === "cards.attachedDonOwnership",
    ),
  );
});

test("invalid turn player reference fails closed", () => {
  const state = createBaseState();
  state.turn.turnPlayerId = toPlayerId("missing-player");

  const violations = collectGameStateInvariantViolations(state);
  assert.ok(
    violations.some(
      (violation) => violation.invariant === "turn.validPlayerRef",
    ),
  );
});

test("assertGameStateInvariants throws typed error with violations payload", () => {
  const state = createBaseState();
  state.turn.turnPlayerId = toPlayerId("missing-player");

  try {
    assertGameStateInvariants(state);
    assert.fail("expected assertGameStateInvariants to throw");
  } catch (error) {
    assert.ok(error instanceof GameStateInvariantError);
    const firstViolation = error.violations.at(0);
    assert.ok(firstViolation !== undefined);
    assert.equal(firstViolation.invariant, "turn.validPlayerRef");
  }
});

test("invariant checks do not mutate input state", () => {
  const state = createBaseState();
  const before = structuredClone(state);

  collectGameStateInvariantViolations(state);
  assertGameStateInvariants(state);

  assert.deepEqual(state, before);
});
