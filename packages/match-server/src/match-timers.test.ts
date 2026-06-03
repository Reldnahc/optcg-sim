import { strict as assert } from "node:assert";
import { beforeAll, describe, test } from "vitest";

import type { PlayerId } from "@optcg/types";

import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import {
  applyLocalDevDecision,
  createLocalDevMatch,
  type DevMatchSetup,
} from "./local-match.js";
import {
  advanceLocalDevMatchTimers,
  applyLocalDevMatchTimerExpiries,
  initializeLocalDevMatchTimers,
  type MatchTimerPolicy,
} from "./match-timers.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const policy: MatchTimerPolicy = {
  gameTimeMs: 1_000,
  disconnectGraceMs: 120,
};

let premadeSetup: DevMatchSetup;

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

const createTimedMatch = () => {
  const match = createLocalDevMatch(structuredClone(premadeSetup));
  while (
    match.state.pendingDecision !== undefined &&
    match.state.pendingDecision.type !== "mulligan"
  ) {
    const decision = match.state.pendingDecision;
    const response =
      decision.type === "selectCards"
        ? { type: "cards" as const, cards: [] }
        : decision.type === "chooseQuantity"
          ? { type: "chooseQuantity" as const, quantity: 0 }
          : undefined;
    if (response === undefined) {
      throw new Error(`Unsupported setup decision ${decision.type}.`);
    }
    const result = applyLocalDevDecision(match, {
      playerId: decision.playerId,
      decisionId: decision.id,
      response,
    });
    assert.deepEqual(result.errors, []);
  }
  initializeLocalDevMatchTimers(match, policy);
  return match;
};

const answerCurrentMulligan = (
  match: ReturnType<typeof createLocalDevMatch>,
): void => {
  const decision = match.state.pendingDecision;
  assert.equal(decision?.type, "mulligan");
  const result = applyLocalDevDecision(match, {
    playerId: decision.playerId,
    decisionId: decision.id,
    response: { type: "mulligan", keep: true },
  });
  assert.deepEqual(result.errors, []);
};

const gameTimer = (
  match: ReturnType<typeof createLocalDevMatch>,
  playerId: PlayerId,
) => {
  const timer = match.state.timers.players[playerId];
  assert.ok(timer !== undefined);
  return timer;
};

const disconnectTimer = (
  match: ReturnType<typeof createLocalDevMatch>,
  playerId: PlayerId,
) => {
  const timers = match.state.timers.disconnects;
  assert.ok(timers !== undefined);
  const timer = timers[playerId];
  assert.ok(timer !== undefined);
  return timer;
};

describe("match timers", () => {
  test("initializes both players with the configured game time", () => {
    const match = createTimedMatch();

    assert.equal(gameTimer(match, p1).remainingMs, 1_000);
    assert.equal(gameTimer(match, p2).remainingMs, 1_000);
    assert.equal(gameTimer(match, p1).isRunning, false);
    assert.equal(gameTimer(match, p2).isRunning, false);
  });

  test("drains both player timers during the first mulligan choice and only the unanswered player after one response", () => {
    const match = createTimedMatch();

    advanceLocalDevMatchTimers(match, {
      connectedPlayerIds: new Set([p1, p2]),
      elapsedMs: 100,
      policy,
    });

    assert.equal(gameTimer(match, p1).remainingMs, 900);
    assert.equal(gameTimer(match, p2).remainingMs, 900);
    assert.equal(gameTimer(match, p1).isRunning, true);
    assert.equal(gameTimer(match, p2).isRunning, true);

    answerCurrentMulligan(match);
    advanceLocalDevMatchTimers(match, {
      connectedPlayerIds: new Set([p1, p2]),
      elapsedMs: 100,
      policy,
    });

    assert.equal(gameTimer(match, p1).remainingMs, 900);
    assert.equal(gameTimer(match, p2).remainingMs, 800);
    assert.equal(gameTimer(match, p1).isRunning, false);
    assert.equal(gameTimer(match, p2).isRunning, true);
  });

  test("pauses disconnect grace on reconnect and resumes without resetting on later disconnects", () => {
    const match = createTimedMatch();

    advanceLocalDevMatchTimers(match, {
      connectedPlayerIds: new Set([p2]),
      elapsedMs: 0,
      policy,
    });
    assert.equal(disconnectTimer(match, p1).remainingMs, 120);
    assert.equal(disconnectTimer(match, p1).isRunning, true);

    advanceLocalDevMatchTimers(match, {
      connectedPlayerIds: new Set([p2]),
      elapsedMs: 30,
      policy,
    });
    assert.equal(disconnectTimer(match, p1).remainingMs, 90);

    advanceLocalDevMatchTimers(match, {
      connectedPlayerIds: new Set([p1, p2]),
      elapsedMs: 0,
      policy,
    });
    assert.equal(disconnectTimer(match, p1).remainingMs, 90);
    assert.equal(disconnectTimer(match, p1).isRunning, false);

    advanceLocalDevMatchTimers(match, {
      connectedPlayerIds: new Set([p2]),
      elapsedMs: 10,
      policy,
    });
    assert.equal(disconnectTimer(match, p1).remainingMs, 80);
    assert.equal(disconnectTimer(match, p1).isRunning, true);
  });

  test("disconnect grace expiry concedes the disconnected player while their game timer also drains", () => {
    const match = createTimedMatch();
    answerCurrentMulligan(match);

    const result = advanceLocalDevMatchTimers(match, {
      connectedPlayerIds: new Set([p1]),
      elapsedMs: 120,
      policy,
    });

    assert.deepEqual(result.expiries, [{ playerId: p2, reason: "disconnect" }]);
    assert.equal(gameTimer(match, p2).remainingMs, 880);

    applyLocalDevMatchTimerExpiries(match, result.expiries);

    assert.deepEqual(match.state.status, { type: "completed", winner: p1 });
    assert.equal(match.state.pendingDecision, undefined);
  });

  test("game timer expiry concedes the player holding up progress", () => {
    const match = createTimedMatch();
    answerCurrentMulligan(match);

    const result = advanceLocalDevMatchTimers(match, {
      connectedPlayerIds: new Set([p1, p2]),
      elapsedMs: 1_000,
      policy,
    });

    assert.deepEqual(result.expiries, [{ playerId: p2, reason: "game" }]);

    applyLocalDevMatchTimerExpiries(match, result.expiries);

    assert.deepEqual(match.state.status, { type: "completed", winner: p1 });
    assert.equal(match.state.pendingDecision, undefined);
  });
});
