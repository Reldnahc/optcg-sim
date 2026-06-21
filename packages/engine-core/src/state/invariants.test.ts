import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardRef,
  EffectQueueEntry,
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

const createLifeTriggerQueueEntry = (source: CardRef): EffectQueueEntry => ({
  id: "queue-entry:life-trigger" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "timing-window:life-trigger" as EffectQueueEntry["timingWindowId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 1,
  queuedAtStateSeq: toStateSeq(2),
  generation: 1,
  controllerId: source.playerId,
  source,
  sourceSnapshot: {
    instanceId: source.instanceId,
    cardId: source.cardId,
    ownerId: source.playerId,
    controllerId: source.playerId,
    zone: { zone: "noZone", playerId: source.playerId, slot: "temporary" },
    category: "character",
    colors: [],
    keywords: [],
  },
  triggerEventId: "event:life-trigger" as NonNullable<
    EffectQueueEntry["triggerEventId"]
  >,
  effectBlockId: "effect:life-trigger" as EffectQueueEntry["effectBlockId"],
  sourcePresencePolicy: "resolveFromLastKnownInformation",
  causedBy: {
    type: "decision",
    decisionId: "decision:life-trigger" as never,
  },
});

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
    cardManifest: {
      manifestHash: "manifest-invariants-1",
      source: "manual-test",
      cardDataVersion: "fixture",
      effectDefinitionsVersion: "fixture",
      customHandlerVersion: "fixture",
      banlistVersion: "fixture",
      createdAt: "2026-05-04T00:00:00.000Z",
      cards: {},
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
    effectExecutionFrames: [],
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

test("active life trigger reveal is a legal temporary card holder", () => {
  const state = createBaseState();
  const p1 = toPlayerId("p1");
  const lifeCard = getPlayer(state, "p1").life.shift();
  assert.ok(lifeCard !== undefined);
  state.revealedCards = [
    {
      id: "reveal:life-trigger:p1-life-1:2",
      cards: [
        {
          instanceId: lifeCard.card.instanceId,
          cardId: lifeCard.card.cardId,
          playerId: p1,
          zone: { zone: "noZone", playerId: p1, slot: "temporary" },
        },
      ],
      visibility: { type: "public" },
      origin: "lifeDamage",
      createdAtStateSeq: toStateSeq(2),
      cleanupPolicy: "trashAfterResolution",
    },
  ];

  assert.deepEqual(collectGameStateInvariantViolations(state), []);
});

test("active life trigger reveal cannot duplicate a card already in a normal zone", () => {
  const state = createBaseState();
  const p1 = toPlayerId("p1");
  const lifeCard = getPlayer(state, "p1").life[0];
  assert.ok(lifeCard !== undefined);
  state.revealedCards = [
    {
      id: "reveal:life-trigger:p1-life-1:2",
      cards: [
        {
          instanceId: lifeCard.card.instanceId,
          cardId: lifeCard.card.cardId,
          playerId: p1,
          zone: { zone: "noZone", playerId: p1, slot: "temporary" },
        },
      ],
      visibility: { type: "public" },
      origin: "lifeDamage",
      createdAtStateSeq: toStateSeq(2),
      cleanupPolicy: "trashAfterResolution",
    },
  ];

  const violations = collectGameStateInvariantViolations(state);
  assert.ok(
    violations.some(
      (violation) => violation.invariant === "cards.exactlyOneLocation",
    ),
  );
});

test("malformed active life trigger reveal does not satisfy card conservation", () => {
  const state = createBaseState();
  const p1 = toPlayerId("p1");
  const lifeCard = getPlayer(state, "p1").life.shift();
  assert.ok(lifeCard !== undefined);
  state.revealedCards = [
    {
      id: "reveal:life-trigger:p1-life-1:2",
      cards: [
        {
          instanceId: lifeCard.card.instanceId,
          cardId: lifeCard.card.cardId,
          playerId: p1,
          zone: { zone: "noZone", playerId: p1, slot: "temporary" },
        },
      ],
      visibility: { type: "public" },
      origin: "custom",
      createdAtStateSeq: toStateSeq(2),
      cleanupPolicy: "trashAfterResolution",
    },
  ];

  const violations = collectGameStateInvariantViolations(state);
  assert.ok(
    violations.some(
      (violation) => violation.invariant === "cards.revealedCardHolder",
    ),
  );
});

test("no-zone life trigger queue source is valid after the card moves to hand", () => {
  const state = createBaseState();
  const p1 = toPlayerId("p1");
  const lifeCard = getPlayer(state, "p1").life.shift();
  assert.ok(lifeCard !== undefined);
  getPlayer(state, "p1").hand.push({
    ...lifeCard.card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
  });
  state.effectQueue.push(
    createLifeTriggerQueueEntry({
      instanceId: lifeCard.card.instanceId,
      cardId: lifeCard.card.cardId,
      playerId: p1,
      zone: { zone: "noZone", playerId: p1, slot: "temporary" },
    }),
  );

  assert.deepEqual(collectGameStateInvariantViolations(state), []);
});

test("no-zone life trigger queue source is valid after the card moves to life", () => {
  const state = createBaseState();
  const p1 = toPlayerId("p1");
  const lifeCard = getPlayer(state, "p1").life.shift();
  assert.ok(lifeCard !== undefined);
  getPlayer(state, "p1").life.push({
    card: {
      ...lifeCard.card,
      zone: { zone: "life", playerId: p1, slot: "life", index: 0 },
    },
    faceUp: true,
  });
  state.effectQueue.push(
    createLifeTriggerQueueEntry({
      instanceId: lifeCard.card.instanceId,
      cardId: lifeCard.card.cardId,
      playerId: p1,
      zone: { zone: "noZone", playerId: p1, slot: "temporary" },
    }),
  );

  assert.deepEqual(collectGameStateInvariantViolations(state), []);
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

test("malformed container ZoneRef fails with stable invariant name", () => {
  const state = createBaseState();
  getPlayer(state, "p1").leader.zone = {
    zone: "hand",
    playerId: toPlayerId("p1"),
    slot: "hand",
    index: 0,
  };
  getPlayer(state, "p2").hand.push(
    createCardInstance({
      instanceId: "p2-hand-1",
      cardId: "hand-1",
      owner: "p2",
      controller: "p2",
      zone: {
        zone: "deck",
        playerId: toPlayerId("p2"),
        slot: "deck",
        index: 0,
      },
    }),
  );

  const violations = collectGameStateInvariantViolations(state);
  assert.ok(
    violations.some((violation) => violation.invariant === "players.zoneRef"),
  );
});

test("missing non-turn-player turn count fails closed", () => {
  const state = createBaseState();
  state.turn.playerTurnCounts = { [toPlayerId("p1")]: 1 };

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

test("duplicate once-per-turn usage key fails with stable invariant name", () => {
  const state = createBaseState();
  state.oncePerTurn.push(
    {
      cardInstanceId: toInstanceId("card-1"),
      effectId: "effect-a",
      turnNumber: 2,
      usedAtStateSeq: toStateSeq(5),
    },
    {
      cardInstanceId: toInstanceId("card-1"),
      effectId: "effect-a",
      turnNumber: 2,
      usedAtStateSeq: toStateSeq(6),
    },
  );

  const violations = collectGameStateInvariantViolations(state);
  assert.ok(
    violations.some(
      (violation) => violation.invariant === "oncePerTurn.uniqueUsageKey",
    ),
  );
});

test("once-per-turn delimiter-collision-shaped records are not treated as duplicates", () => {
  const state = createBaseState();
  state.oncePerTurn.push(
    {
      cardInstanceId: toInstanceId("card|alpha"),
      effectId: "effect",
      turnNumber: 2,
      usedAtStateSeq: toStateSeq(5),
    },
    {
      cardInstanceId: toInstanceId("card"),
      effectId: "alpha|effect",
      turnNumber: 2,
      usedAtStateSeq: toStateSeq(6),
    },
  );

  const violations = collectGameStateInvariantViolations(state);
  assert.equal(
    violations.some(
      (violation) => violation.invariant === "oncePerTurn.uniqueUsageKey",
    ),
    false,
  );
});
