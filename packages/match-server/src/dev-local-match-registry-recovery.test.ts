import { strict as assert } from "node:assert";
import { beforeAll, test } from "vitest";

import type { MatchId } from "@optcg/types";

import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import { createLocalDevMatchRegistry } from "./dev-local-match-registry.js";
import type { AuthContext } from "./dev-auth.js";
import type { DevMatchSetup } from "./local-match.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import type {
  MatchPersistence,
  MatchPersistenceSnapshot,
} from "./session-types.js";

let premadeSetup: DevMatchSetup;

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

const waitForBotMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
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
