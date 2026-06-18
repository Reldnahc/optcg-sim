import { strict as assert } from "node:assert";
import { afterEach, beforeAll, test, vi } from "vitest";

import type { MatchId } from "@optcg/types";

import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import { createLocalDevMatchRegistry } from "./dev-local-match-registry.js";
import type { AuthContext } from "./dev-auth.js";
import type { DevMatchSetup } from "./local-match.js";
import type { MatchTimerPolicy } from "./match-timers.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import type {
  MatchPersistence,
  MatchPersistenceSnapshot,
} from "./session-types.js";
import { defaultBotStrategy } from "./bot-player.js";

let premadeSetup: DevMatchSetup;

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

afterEach(() => {
  vi.useRealTimers();
});

const shortTimerPolicy: MatchTimerPolicy = {
  gameTimeMs: 1_000,
  disconnectGraceMs: 120_000,
};

const waitForBotMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 50; index += 1) {
    await Promise.resolve();
  }
};

const deferredVoid = (): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} => {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve() {
      if (resolvePromise === undefined) {
        throw new Error("Deferred promise was not initialized.");
      }
      resolvePromise();
    },
  };
};

const authContext = (
  userId: string,
  sessionId: string,
  displayName: string,
): AuthContext => ({
  subject: {
    type: "user",
    userId,
    sessionId,
    displayName,
  },
});

test("concurrent seat checkpoint rollback cannot undo a later successful refresh", async () => {
  const basePersistence = createInMemoryMatchPersistence();
  const firstRefreshStarted = deferredVoid();
  let rejectFirstRefresh: ((error: Error) => void) | undefined;
  const firstRefreshFailure = new Promise<void>((_resolve, reject) => {
    rejectFirstRefresh = reject;
  });
  let saveCount = 0;
  const persistence: MatchPersistence = {
    ...basePersistence,
    async saveSnapshot(input: MatchPersistenceSnapshot) {
      saveCount += 1;
      if (saveCount === 3) {
        firstRefreshStarted.resolve();
        await firstRefreshFailure;
      }
      await basePersistence.saveSnapshot(input);
    },
  };
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: persistence,
    },
  );
  const matchId = "seat-claim-concurrent-checkpoint-match" as MatchId;
  const playerId = premadeSetup.playerOrder[0];
  const initialAuth = authContext("seat-user", "session-1", "Seat User");
  const firstRefreshAuth = authContext(
    "seat-user",
    "session-2",
    "First Refresh",
  );
  const secondRefreshAuth = authContext(
    "seat-user",
    "session-3",
    "Second Refresh",
  );
  const created = await registry.createMatch(
    {
      ...structuredClone(premadeSetup),
      matchId,
    },
    {
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: playerId,
        choice: "goFirst",
        resolvedFirstPlayerId: playerId,
      },
    },
  );
  if (created.snapshot === undefined) {
    throw new Error("Expected an active match snapshot.");
  }
  const initialClaim = await registry.claimSeat(matchId, playerId, initialAuth);
  if (typeof initialClaim === "string") {
    throw new Error(`Expected initial seat claim to succeed: ${initialClaim}`);
  }

  const firstRefreshPromise = registry.claimSeatForAuth(
    matchId,
    firstRefreshAuth,
  );
  await firstRefreshStarted.promise;
  const secondRefreshPromise = registry.claimSeatForAuth(
    matchId,
    secondRefreshAuth,
  );
  await waitForBotMicrotasks();
  if (rejectFirstRefresh === undefined) {
    throw new Error("Expected first refresh rejection hook.");
  }
  rejectFirstRefresh(new Error("checkpoint failed"));

  await assert.rejects(firstRefreshPromise, /checkpoint failed/u);
  const secondRefresh = await secondRefreshPromise;

  if (typeof secondRefresh === "string") {
    throw new Error(`Expected second refresh to succeed: ${secondRefresh}`);
  }
  assert.equal(
    registry.authorizeSeat(secondRefreshAuth, matchId, playerId),
    "authorized",
  );
  assert.equal(
    registry.authorizeSeat(initialAuth, matchId, playerId),
    "forbidden",
  );
  assert.equal(
    registry.authorizeSeat(firstRefreshAuth, matchId, playerId),
    "forbidden",
  );
});

test("concurrent session rollback cannot undo a later successful reset", async () => {
  const basePersistence = createInMemoryMatchPersistence();
  const chooseStarted = deferredVoid();
  let rejectChoose: ((error: Error) => void) | undefined;
  const chooseFailure = new Promise<void>((_resolve, reject) => {
    rejectChoose = reject;
  });
  let saveCount = 0;
  const persistence: MatchPersistence = {
    ...basePersistence,
    async saveSnapshot(input: MatchPersistenceSnapshot) {
      saveCount += 1;
      if (saveCount === 1) {
        chooseStarted.resolve();
        await chooseFailure;
      }
      await basePersistence.saveSnapshot(input);
    },
  };
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: persistence,
    },
  );
  const matchId = "session-concurrent-checkpoint-match" as MatchId;
  const created = await registry.createMatch({
    ...structuredClone(premadeSetup),
    matchId,
  });
  const chooser = created.firstPlayerChoice.chooserPlayerId;

  const choosePromise = registry.chooseFirstPlayer(matchId, chooser, "goFirst");
  await chooseStarted.promise;
  const resetPromise = registry.resetMatch(matchId, {
    ...structuredClone(premadeSetup),
    matchId,
  });
  await waitForBotMicrotasks();
  if (rejectChoose === undefined) {
    throw new Error("Expected first-player rejection hook.");
  }
  rejectChoose(new Error("checkpoint failed"));

  await assert.rejects(choosePromise, /checkpoint failed/u);
  const reset = await resetPromise;

  assert.ok(reset.snapshot !== undefined);
  assert.ok(registry.getMatch(matchId) !== undefined);
  assert.equal(registry.getFirstPlayerChoice(matchId), undefined);
});

test("concurrent session rollback cannot undo a later explicit create for the same match", async () => {
  const basePersistence = createInMemoryMatchPersistence();
  const chooseStarted = deferredVoid();
  let rejectChoose: ((error: Error) => void) | undefined;
  const chooseFailure = new Promise<void>((_resolve, reject) => {
    rejectChoose = reject;
  });
  let saveCount = 0;
  const persistence: MatchPersistence = {
    ...basePersistence,
    async saveSnapshot(input: MatchPersistenceSnapshot) {
      saveCount += 1;
      if (saveCount === 1) {
        chooseStarted.resolve();
        await chooseFailure;
      }
      await basePersistence.saveSnapshot(input);
    },
  };
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: persistence,
    },
  );
  const matchId = "session-create-concurrent-checkpoint-match" as MatchId;
  const playerId = premadeSetup.playerOrder[0];
  const created = await registry.createMatch({
    ...structuredClone(premadeSetup),
    matchId,
  });
  const chooser = created.firstPlayerChoice.chooserPlayerId;

  const choosePromise = registry.chooseFirstPlayer(matchId, chooser, "goFirst");
  await chooseStarted.promise;
  const createPromise = registry.createMatch(
    {
      ...structuredClone(premadeSetup),
      matchId,
    },
    {
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: playerId,
        choice: "goFirst",
        resolvedFirstPlayerId: playerId,
      },
    },
  );
  await waitForBotMicrotasks();
  if (rejectChoose === undefined) {
    throw new Error("Expected first-player rejection hook.");
  }
  rejectChoose(new Error("checkpoint failed"));

  await assert.rejects(choosePromise, /checkpoint failed/u);
  const replacement = await createPromise;

  assert.ok(replacement.snapshot !== undefined);
  assert.ok(registry.getMatch(matchId) !== undefined);
  assert.equal(registry.getFirstPlayerChoice(matchId), undefined);
});

test("bot actions wait for an active checkpoint before applying", async () => {
  vi.useFakeTimers();
  const basePersistence = createInMemoryMatchPersistence();
  const checkpointStarted = deferredVoid();
  const checkpointRelease = deferredVoid();
  let saveCount = 0;
  const persistence: MatchPersistence = {
    ...basePersistence,
    async saveSnapshot(input: MatchPersistenceSnapshot) {
      saveCount += 1;
      if (saveCount === 2) {
        checkpointStarted.resolve();
        await checkpointRelease.promise;
      }
      await basePersistence.saveSnapshot(input);
    },
  };
  const botUpdates: MatchId[] = [];
  const chooseAction = vi.fn(defaultBotStrategy.chooseAction);
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      botActionDelayMs: 1_000,
      botStrategy: { chooseAction },
      createDefaultMatch: false,
      matchPersistence: persistence,
      onBotActionAccepted(matchId) {
        botUpdates.push(matchId);
      },
    },
  );
  const matchId = "bot-waits-for-checkpoint-match" as MatchId;
  const botPlayerId = premadeSetup.playerOrder[0];
  const humanPlayerId = premadeSetup.playerOrder[1];
  await registry.createMatch(
    {
      ...structuredClone(premadeSetup),
      matchId,
    },
    {
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: botPlayerId,
        choice: "goFirst",
        resolvedFirstPlayerId: botPlayerId,
      },
      botPlayerIds: [botPlayerId],
    },
  );

  const claimPromise = registry.claimSeat(
    matchId,
    humanPlayerId,
    authContext("human-user", "session-1", "Human User"),
  );
  await checkpointStarted.promise;
  await vi.advanceTimersByTimeAsync(1_000);
  await waitForBotMicrotasks();

  assert.deepEqual(botUpdates, []);
  assert.equal(chooseAction.mock.calls.length, 0);

  checkpointRelease.resolve();
  const claimed = await claimPromise;
  if (typeof claimed === "string") {
    throw new Error(`Expected seat claim to succeed: ${claimed}`);
  }
  await waitForBotMicrotasks();

  assert.equal(chooseAction.mock.calls.length, 1);
  assert.deepEqual(botUpdates, [matchId]);
});

test("timer expiries are checkpointed for active recovery", async () => {
  const persistence = createInMemoryMatchPersistence();
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: persistence,
      matchTimerPolicy: shortTimerPolicy,
    },
  );
  const matchId = "timer-expiry-recovery-match" as MatchId;
  const playerId = premadeSetup.playerOrder[0];
  const opponentId = premadeSetup.playerOrder[1];
  await registry.createMatch(
    {
      ...structuredClone(premadeSetup),
      matchId,
    },
    {
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: playerId,
        choice: "goFirst",
        resolvedFirstPlayerId: playerId,
      },
    },
  );

  await registry.advanceTimers({
    elapsedMs: 1_000,
    connectedPlayerIds: () => new Set([playerId, opponentId]),
    matchIds: [matchId],
  });
  const recoveredRegistry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: persistence,
      matchTimerPolicy: shortTimerPolicy,
    },
  );

  assert.deepEqual(recoveredRegistry.getMatch(matchId)?.state.status, {
    type: "completed",
    winner: opponentId,
  });
});

test("recovered active matches do not drain timers before sockets reconnect", async () => {
  const persistence = createInMemoryMatchPersistence();
  const matchTimerPolicy: MatchTimerPolicy = {
    gameTimeMs: 10_000,
    disconnectGraceMs: 120,
  };
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: persistence,
      matchTimerPolicy,
    },
  );
  const matchId = "recovered-presence-suspended-timers-match" as MatchId;
  const playerId = premadeSetup.playerOrder[0];
  const opponentId = premadeSetup.playerOrder[1];
  await registry.createMatch(
    {
      ...structuredClone(premadeSetup),
      matchId,
    },
    {
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: playerId,
        choice: "goFirst",
        resolvedFirstPlayerId: playerId,
      },
    },
  );
  const recoveredRegistry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: persistence,
      matchTimerPolicy,
    },
  );

  const suspendedUpdates = await recoveredRegistry.advanceTimers({
    elapsedMs: 121,
    connectedPlayerIds: () => new Set(),
    matchIds: [matchId],
  });

  assert.deepEqual(suspendedUpdates, []);
  assert.notEqual(
    recoveredRegistry.getMatch(matchId)?.state.status.type,
    "completed",
  );
  assert.notEqual(
    recoveredRegistry.getMatch(matchId)?.state.status.type,
    "gameOver",
  );
  assert.equal(
    recoveredRegistry.getMatch(matchId)?.state.timers.disconnects,
    undefined,
  );

  const resumedUpdates = await recoveredRegistry.advanceTimers({
    elapsedMs: 30,
    connectedPlayerIds: () => new Set([playerId]),
    matchIds: [matchId],
  });
  const opponentDisconnect =
    recoveredRegistry.getMatch(matchId)?.state.timers.disconnects?.[opponentId];

  assert.deepEqual(resumedUpdates, [{ matchId, sync: "timers" }]);
  assert.ok(opponentDisconnect !== undefined);
  assert.equal(opponentDisconnect.remainingMs, 90);
  assert.equal(opponentDisconnect.isRunning, true);
});
