import { strict as assert } from "node:assert";
import { afterEach, beforeAll, test, vi } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

import { requestHash } from "./action-envelope.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import {
  createLocalDevMatchRegistry,
  type CreatedDevMatchResponse,
} from "./dev-local-match-registry.js";
import type { AuthContext } from "./dev-auth.js";
import { getLocalDevSnapshot } from "./local-match.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import type { BotStrategy } from "./bot-types.js";
import type { DevMatchSetup } from "./local-match.js";
import type { MatchTimerPolicy } from "./match-timers.js";
import type {
  ClientActionEnvelope,
  MatchPersistence,
  MatchPersistenceSnapshot,
  SessionActionRequest,
} from "./session-types.js";
import type { CompletedMatchRepository } from "./postgres-completed-match.js";

let premadeSetup: DevMatchSetup;

const shortTimerPolicy: MatchTimerPolicy = {
  gameTimeMs: 1_000,
  disconnectGraceMs: 120_000,
};

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

afterEach(() => {
  vi.useRealTimers();
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

const resolveFirstPlayerChoice = async (
  registry: Awaited<ReturnType<typeof createLocalDevMatchRegistry>>,
  created: CreatedDevMatchResponse,
): Promise<void> => {
  const result = await registry.chooseFirstPlayer(
    created.matchId,
    created.firstPlayerChoice.chooserPlayerId,
    "goFirst",
  );
  if (typeof result === "string") {
    throw new Error(`Unable to choose first player: ${result}`);
  }
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

test("can create active matches without game timers", async () => {
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { createDefaultMatch: false },
  );
  const matchId = "timerless-match" as MatchId;

  const created = await registry.createMatch(
    { ...structuredClone(premadeSetup), matchId },
    { timersEnabled: false },
  );
  await resolveFirstPlayerChoice(registry, created);

  const match = registry.getMatch(matchId);
  assert.ok(match !== undefined);
  assert.deepEqual(match.state.timers.players, {});
  assert.deepEqual(
    registry.advanceTimers({
      elapsedMs: 1_000,
      connectedPlayerIds: () => new Set(),
      matchIds: [matchId],
    }),
    [],
  );
  assert.deepEqual(match.state.timers.players, {});
});

test("accepted registry actions include snapshots for replay frames", async () => {
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { createDefaultMatch: false },
  );
  const matchId = "replay-snapshot-match" as MatchId;
  const created = await registry.createMatch({
    ...structuredClone(premadeSetup),
    matchId,
  });
  const ready = await registry.chooseFirstPlayer(
    created.matchId,
    created.firstPlayerChoice.chooserPlayerId,
    "goFirst",
  );
  if (typeof ready === "string" || ready.snapshot === undefined) {
    throw new Error(
      `Unable to start match: ${
        typeof ready === "string" ? ready : "missing snapshot"
      }`,
    );
  }
  const actionOwner = Object.entries(ready.snapshot.players).find(
    ([, player]) => player.actions.length > 0,
  );
  const playerId = actionOwner?.[0] as PlayerId | undefined;
  const actionIndex = actionOwner?.[1].actions[0]?.index;
  if (playerId === undefined || actionIndex === undefined) {
    throw new Error("Expected a player with a visible action.");
  }
  const request: SessionActionRequest = {
    type: "submitAction",
    playerId,
    actionIndex,
    expectedStateSeq: ready.snapshot.stateSeq,
  };
  const envelope: ClientActionEnvelope = {
    protocolVersion: "dev",
    matchId,
    playerId,
    clientActionId: "replay-snapshot-action",
    expectedStateSeq: ready.snapshot.stateSeq,
    requestHash: requestHash(request),
    request,
  };

  const result = await registry.applyEnvelope(envelope);

  assert.notEqual(result, "matchNotFound");
  assert.equal(typeof result, "object");
  if (typeof result === "object") {
    assert.equal(result.accepted, true);
    assert.ok(result.snapshot?.players[playerId] !== undefined);
  }
});

test("active persistence stores compact accepted records without replay snapshots", async () => {
  const persistence = createInMemoryMatchPersistence();
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: persistence,
    },
  );
  const matchId = "compact-active-persistence-match" as MatchId;
  const created = await registry.createMatch(
    {
      ...structuredClone(premadeSetup),
      matchId,
    },
    {
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: premadeSetup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: premadeSetup.playerOrder[0],
      },
    },
  );
  if (created.snapshot === undefined) {
    throw new Error("Expected an active match snapshot.");
  }
  const actionOwner = Object.entries(created.snapshot.players).find(
    ([, player]) => player.actions.length > 0,
  );
  const playerId = actionOwner?.[0] as PlayerId | undefined;
  const actionIndex = actionOwner?.[1].actions[0]?.index;
  if (playerId === undefined || actionIndex === undefined) {
    throw new Error("Expected a player with a visible action.");
  }
  const request: SessionActionRequest = {
    type: "submitAction",
    playerId,
    actionIndex,
    expectedStateSeq: created.snapshot.stateSeq,
  };
  const envelope: ClientActionEnvelope = {
    protocolVersion: "dev",
    matchId,
    playerId,
    clientActionId: "compact-active-persistence-action",
    expectedStateSeq: created.snapshot.stateSeq,
    requestHash: requestHash(request),
    request,
  };

  const result = await registry.applyEnvelope(envelope);
  const loaded = await persistence.loadSnapshot(matchId);

  assert.notEqual(result, "matchNotFound");
  assert.equal(typeof result, "object");
  assert.ok(loaded !== undefined);
  if (typeof result === "object") {
    assert.equal(result.accepted, true);
    assert.ok(result.snapshot !== undefined);
    assert.equal(loaded.state.seq, created.snapshot.stateSeq);
    assert.equal(loaded.actions.length, 1);
    assert.equal(loaded.actions[0]?.result.snapshot, undefined);
  }
});

test("active persistence rehydrates a match from checkpoint and compact action log", async () => {
  const persistence = createInMemoryMatchPersistence();
  const matchId = "active-persistence-recovery-match" as MatchId;
  const firstRegistry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: persistence,
    },
  );
  const created = await firstRegistry.createMatch(
    {
      ...structuredClone(premadeSetup),
      matchId,
    },
    {
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: premadeSetup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: premadeSetup.playerOrder[0],
      },
    },
  );
  if (created.snapshot === undefined) {
    throw new Error("Expected an active match snapshot.");
  }
  const actionOwner = Object.entries(created.snapshot.players).find(
    ([, player]) => player.actions.length > 0,
  );
  const playerId = actionOwner?.[0] as PlayerId | undefined;
  const actionIndex = actionOwner?.[1].actions[0]?.index;
  if (playerId === undefined || actionIndex === undefined) {
    throw new Error("Expected a player with a visible action.");
  }
  const request: SessionActionRequest = {
    type: "submitAction",
    playerId,
    actionIndex,
    expectedStateSeq: created.snapshot.stateSeq,
  };
  const envelope: ClientActionEnvelope = {
    protocolVersion: "dev",
    matchId,
    playerId,
    clientActionId: "recovered-active-persistence-action",
    expectedStateSeq: created.snapshot.stateSeq,
    requestHash: requestHash(request),
    request,
  };
  const accepted = await firstRegistry.applyEnvelope(envelope);
  if (accepted === "matchNotFound" || !accepted.accepted) {
    throw new Error("Expected the first registry action to be accepted.");
  }

  const recoveredRegistry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: persistence,
    },
  );
  const recoveredMatch = recoveredRegistry.getMatch(matchId);
  const duplicate = await recoveredRegistry.applyEnvelope(envelope);

  assert.ok(recoveredMatch !== undefined);
  assert.equal(recoveredMatch.state.seq, accepted.stateSeq);
  assert.equal(recoveredMatch.state.actionSeq, accepted.actionSeq);
  assert.notEqual(duplicate, "matchNotFound");
  assert.equal(typeof duplicate, "object");
  if (typeof duplicate === "object") {
    assert.equal(duplicate.accepted, true);
    assert.equal(duplicate.stateSeq, accepted.stateSeq);
  }
  assert.equal(getLocalDevSnapshot(recoveredMatch).stateSeq, accepted.stateSeq);
});

test("active persistence rehydrates claimed seats for account reconnect", async () => {
  const persistence = createInMemoryMatchPersistence();
  const matchId = "active-persistence-claimed-seat-match" as MatchId;
  const playerId = premadeSetup.playerOrder[0];
  const initialAuth = authContext("claimed-user", "session-1", "Claimed User");
  const refreshedAuth = authContext(
    "claimed-user",
    "session-2",
    "Refreshed User",
  );
  const firstRegistry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: persistence,
    },
  );
  const created = await firstRegistry.createMatch(
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

  const claimed = await firstRegistry.claimSeat(matchId, playerId, initialAuth);
  if (typeof claimed === "string") {
    throw new Error(`Expected seat claim to succeed: ${claimed}`);
  }
  const recoveredRegistry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: persistence,
    },
  );

  const reconnected = await recoveredRegistry.claimSeatForAuth(
    matchId,
    refreshedAuth,
  );

  if (typeof reconnected === "string") {
    throw new Error(`Expected recovered seat claim to succeed: ${reconnected}`);
  }
  assert.equal(reconnected.seat.playerId, playerId);
  assert.equal(
    recoveredRegistry.authorizeSeat(refreshedAuth, matchId, playerId),
    "authorized",
  );
});

test("first-player choice waits for the active checkpoint before resolving", async () => {
  const basePersistence = createInMemoryMatchPersistence();
  const checkpointGate = deferredVoid();
  let checkpointStarted = false;
  const blockingPersistence: MatchPersistence = {
    ...basePersistence,
    async saveSnapshot(input: MatchPersistenceSnapshot) {
      checkpointStarted = true;
      await checkpointGate.promise;
      await basePersistence.saveSnapshot(input);
    },
  };
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: blockingPersistence,
    },
  );
  const matchId = "first-player-choice-checkpoint-match" as MatchId;
  const created = await registry.createMatch({
    ...structuredClone(premadeSetup),
    matchId,
  });
  const chooser = created.firstPlayerChoice.chooserPlayerId;

  const choicePromise = Promise.resolve(
    registry.chooseFirstPlayer(matchId, chooser, "goFirst"),
  );
  let resolved = false;
  void choicePromise.then(() => {
    resolved = true;
  });
  await waitForBotMicrotasks();

  assert.equal(checkpointStarted, true);
  assert.equal(resolved, false);

  checkpointGate.resolve();
  const ready = await choicePromise;

  if (typeof ready === "string" || ready.snapshot === undefined) {
    throw new Error(
      `Unable to start match: ${
        typeof ready === "string" ? ready : "missing snapshot"
      }`,
    );
  }
  assert.equal(ready.matchId, matchId);
});

test("first-player choice stays retryable when the active checkpoint fails", async () => {
  const basePersistence = createInMemoryMatchPersistence();
  let failSaves = true;
  const failingPersistence: MatchPersistence = {
    ...basePersistence,
    async saveSnapshot(input: MatchPersistenceSnapshot) {
      if (failSaves) {
        throw new Error("checkpoint failed");
      }
      await basePersistence.saveSnapshot(input);
    },
  };
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: failingPersistence,
    },
  );
  const matchId = "first-player-choice-failed-checkpoint-match" as MatchId;
  const created = await registry.createMatch({
    ...structuredClone(premadeSetup),
    matchId,
  });
  const chooser = created.firstPlayerChoice.chooserPlayerId;

  await assert.rejects(
    () => registry.chooseFirstPlayer(matchId, chooser, "goFirst"),
    /checkpoint failed/u,
  );

  assert.notEqual(registry.getFirstPlayerChoice(matchId), undefined);
  assert.equal(registry.getMatch(matchId), undefined);

  failSaves = false;
  const retried = await registry.chooseFirstPlayer(matchId, chooser, "goFirst");

  if (typeof retried === "string" || retried.snapshot === undefined) {
    throw new Error(
      `Expected retry to start match: ${
        typeof retried === "string" ? retried : "missing snapshot"
      }`,
    );
  }
  assert.equal(retried.matchId, matchId);
});

test("seat claims roll back when their active checkpoint fails", async () => {
  const basePersistence = createInMemoryMatchPersistence();
  let failSaves = false;
  const failingPersistence: MatchPersistence = {
    ...basePersistence,
    async saveSnapshot(input: MatchPersistenceSnapshot) {
      if (failSaves) {
        throw new Error("checkpoint failed");
      }
      await basePersistence.saveSnapshot(input);
    },
  };
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchPersistence: failingPersistence,
    },
  );
  const matchId = "seat-claim-failed-checkpoint-match" as MatchId;
  const playerId = premadeSetup.playerOrder[0];
  const initialAuth = authContext("seat-user", "session-1", "Seat User");
  const refreshedAuth = authContext(
    "seat-user",
    "session-2",
    "Refreshed Seat User",
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

  failSaves = true;
  await assert.rejects(
    () => registry.claimSeat(matchId, playerId, initialAuth),
    /checkpoint failed/u,
  );

  assert.equal(
    registry.authorizeSeat(initialAuth, matchId, playerId),
    "forbidden",
  );

  failSaves = false;
  const claimed = await registry.claimSeat(matchId, playerId, initialAuth);
  if (typeof claimed === "string") {
    throw new Error(`Expected retry seat claim to succeed: ${claimed}`);
  }

  failSaves = true;
  await assert.rejects(
    () => registry.claimSeatForAuth(matchId, refreshedAuth),
    /checkpoint failed/u,
  );

  assert.equal(
    registry.authorizeSeat(initialAuth, matchId, playerId),
    "authorized",
  );
  assert.equal(
    registry.authorizeSeat(refreshedAuth, matchId, playerId),
    "forbidden",
  );
});

test("completed-match save does not block the terminal action response", async () => {
  const saveStarted = deferredVoid();
  const saveFinished = deferredVoid();
  let saveCount = 0;
  const completedMatchRepository: CompletedMatchRepository = {
    async saveCompletedMatch() {
      saveCount += 1;
      saveStarted.resolve();
      await saveFinished.promise;
    },
  };
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { completedMatchRepository, createDefaultMatch: false },
  );
  const matchId = "async-completed-match-save" as MatchId;
  const created = await registry.createMatch({
    ...structuredClone(premadeSetup),
    matchId,
  });
  const ready = await registry.chooseFirstPlayer(
    created.matchId,
    created.firstPlayerChoice.chooserPlayerId,
    "goFirst",
  );
  if (typeof ready === "string" || ready.snapshot === undefined) {
    throw new Error(
      `Unable to start match: ${
        typeof ready === "string" ? ready : "missing snapshot"
      }`,
    );
  }
  let snapshot = ready.snapshot;
  let playerId: PlayerId | undefined;
  let actionIndex: number | undefined;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const concedeOwner = Object.entries(snapshot.players).find(([, player]) =>
      player.actions.some((action) => action.type === "concede"),
    );
    playerId = concedeOwner?.[0] as PlayerId | undefined;
    actionIndex = concedeOwner?.[1].actions.find(
      (action) => action.type === "concede",
    )?.index;
    if (playerId !== undefined && actionIndex !== undefined) {
      break;
    }
    const pendingPlayerId = Object.values(snapshot.players).find(
      (player) => player.view.pendingDecision !== undefined,
    )?.view.pendingDecision?.playerId;
    if (pendingPlayerId === undefined) {
      throw new Error("Expected pending setup before concede action.");
    }
    const setupAction = snapshot.players[pendingPlayerId]?.actions[0];
    if (setupAction?.index === undefined) {
      throw new Error("Expected visible setup action.");
    }
    const setupRequest: SessionActionRequest = {
      type: "submitAction",
      playerId: pendingPlayerId,
      actionIndex: setupAction.index,
      expectedStateSeq: snapshot.stateSeq,
    };
    const setupResult = await registry.applyEnvelope({
      protocolVersion: "dev",
      matchId,
      playerId: pendingPlayerId,
      clientActionId: `async-completed-match-setup-${String(attempt)}`,
      expectedStateSeq: snapshot.stateSeq,
      requestHash: requestHash(setupRequest),
      request: setupRequest,
    });
    if (setupResult === "matchNotFound" || !setupResult.accepted) {
      throw new Error("Expected setup action to be accepted.");
    }
    if (setupResult.snapshot === undefined) {
      throw new Error("Expected setup action snapshot.");
    }
    snapshot = setupResult.snapshot;
  }
  if (playerId === undefined || actionIndex === undefined) {
    throw new Error("Timed out advancing setup to concession.");
  }
  const request: SessionActionRequest = {
    type: "submitAction",
    playerId,
    actionIndex,
    expectedStateSeq: snapshot.stateSeq,
  };
  const envelope: ClientActionEnvelope = {
    protocolVersion: "dev",
    matchId,
    playerId,
    clientActionId: "async-completed-match-save-action",
    expectedStateSeq: snapshot.stateSeq,
    requestHash: requestHash(request),
    request,
  };

  const actionPromise = registry.applyEnvelope(envelope);
  let actionReturnedBeforeSaveFinished = false;
  void actionPromise.then(() => {
    actionReturnedBeforeSaveFinished = true;
  });
  await saveStarted.promise;
  await waitForBotMicrotasks();
  saveFinished.resolve();
  const result = await actionPromise;

  assert.notEqual(result, "matchNotFound");
  assert.equal(typeof result, "object");
  if (typeof result === "object") {
    assert.equal(result.accepted, true);
  }
  assert.equal(actionReturnedBeforeSaveFinished, true);
  assert.equal(saveCount, 1);
});

test("registry can omit action result snapshots for live socket traffic", async () => {
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { createDefaultMatch: false, includeActionSnapshots: false },
  );
  const matchId = "live-socket-no-action-snapshot" as MatchId;
  const created = await registry.createMatch({
    ...structuredClone(premadeSetup),
    matchId,
  });
  const ready = await registry.chooseFirstPlayer(
    created.matchId,
    created.firstPlayerChoice.chooserPlayerId,
    "goFirst",
  );
  if (typeof ready === "string" || ready.snapshot === undefined) {
    throw new Error(
      `Unable to start match: ${
        typeof ready === "string" ? ready : "missing snapshot"
      }`,
    );
  }
  const actionOwner = Object.entries(ready.snapshot.players).find(
    ([, player]) => player.actions.length > 0,
  );
  const playerId = actionOwner?.[0] as PlayerId | undefined;
  const actionIndex = actionOwner?.[1].actions[0]?.index;
  if (playerId === undefined || actionIndex === undefined) {
    throw new Error("Expected a player with a visible action.");
  }
  const request: SessionActionRequest = {
    type: "submitAction",
    playerId,
    actionIndex,
    expectedStateSeq: ready.snapshot.stateSeq,
  };

  const result = await registry.applyEnvelope({
    protocolVersion: "dev",
    matchId,
    playerId,
    clientActionId: "live-socket-no-snapshot-action",
    expectedStateSeq: ready.snapshot.stateSeq,
    requestHash: requestHash(request),
    request,
  });

  assert.notEqual(result, "matchNotFound");
  assert.equal(typeof result, "object");
  if (typeof result === "object") {
    assert.equal(result.accepted, true);
    assert.equal(result.snapshot, undefined);
  }
});

test("first-player choice drains the chooser game timer before the engine starts", async () => {
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { createDefaultMatch: false, matchTimerPolicy: shortTimerPolicy },
  );
  const matchId = "timed-first-player-choice" as MatchId;
  const created = await registry.createMatch({
    ...structuredClone(premadeSetup),
    matchId,
  });
  const chooser = created.firstPlayerChoice.chooserPlayerId;

  assert.deepEqual(
    registry.advanceTimers({
      elapsedMs: 250,
      connectedPlayerIds: () =>
        new Set([premadeSetup.playerOrder[0], premadeSetup.playerOrder[1]]),
      matchIds: [matchId],
    }),
    [{ matchId, sync: "timers" }],
  );

  const ready = await registry.chooseFirstPlayer(matchId, chooser, "goFirst");
  if (typeof ready === "string") {
    throw new Error(`Unable to start match: ${ready}`);
  }
  if (ready.snapshot === undefined) {
    throw new Error("Unable to start match without a snapshot.");
  }
  assert.equal(
    ready.snapshot.players[chooser]?.view.timers.players[chooser]?.remainingMs,
    750,
  );
});

test("first-player choice timeout concedes the chooser", async () => {
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { createDefaultMatch: false, matchTimerPolicy: shortTimerPolicy },
  );
  const matchId = "expired-first-player-choice" as MatchId;
  const created = await registry.createMatch({
    ...structuredClone(premadeSetup),
    matchId,
  });
  const chooser = created.firstPlayerChoice.chooserPlayerId;
  const opponent = premadeSetup.playerOrder.find(
    (playerId) => playerId !== chooser,
  );
  if (opponent === undefined) {
    throw new Error("Expected opponent player id.");
  }

  assert.deepEqual(
    registry.advanceTimers({
      elapsedMs: 1_000,
      connectedPlayerIds: () =>
        new Set([premadeSetup.playerOrder[0], premadeSetup.playerOrder[1]]),
      matchIds: [matchId],
    }),
    [{ matchId, sync: "state" }],
  );
  const ready = await registry.chooseFirstPlayer(matchId, chooser, "goFirst");

  assert.equal(ready, "alreadyStarted");
  const match = registry.getMatch(matchId);
  assert.deepEqual(match?.state.status, {
    type: "completed",
    winner: opponent,
  });
});

test("bot players are exempt from disconnect timers", async () => {
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      createDefaultMatch: false,
      matchTimerPolicy: { gameTimeMs: 1_000, disconnectGraceMs: 100 },
    },
  );
  const matchId = "bot-disconnect-exempt" as MatchId;
  const botPlayerId = premadeSetup.playerOrder[1];
  const created = await registry.createMatch(
    {
      ...structuredClone(premadeSetup),
      matchId,
    },
    {
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: premadeSetup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: premadeSetup.playerOrder[0],
      },
      botPlayerIds: [botPlayerId],
    },
  );
  assert.equal(
    created.snapshot?.players[botPlayerId]?.view.timers.disconnects?.[
      botPlayerId
    ],
    undefined,
  );

  assert.deepEqual(
    registry.advanceTimers({
      elapsedMs: 100,
      connectedPlayerIds: () => new Set([premadeSetup.playerOrder[0]]),
      matchIds: [matchId],
    }),
    [{ matchId, sync: "timers" }],
  );

  const match = registry.getMatch(matchId);
  assert.notEqual(match?.state.status.type, "completed");
  assert.notEqual(match?.state.status.type, "gameOver");
  assert.equal(match?.state.timers.disconnects?.[botPlayerId], undefined);
});

test("bot players do not concede while waiting on human setup decisions", async () => {
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { createDefaultMatch: false },
  );
  const matchId = "bot-waits-for-human-setup" as MatchId;
  const humanPlayerId = premadeSetup.playerOrder[0];
  const botPlayerId = premadeSetup.playerOrder[1];
  const created = await registry.createMatch(
    {
      ...structuredClone(premadeSetup),
      matchId,
    },
    {
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: humanPlayerId,
        choice: "goFirst",
        resolvedFirstPlayerId: humanPlayerId,
      },
      botPlayerIds: [botPlayerId],
    },
  );
  await waitForBotMicrotasks();

  const match = registry.getMatch(created.matchId);

  assert.notEqual(match?.state.status.type, "completed");
  assert.notEqual(match?.state.status.type, "gameOver");
  assert.equal(match?.state.pendingDecision?.playerId, humanPlayerId);
});

test("bot players schedule delayed actions without blocking match creation", async () => {
  vi.useFakeTimers();
  const botUpdates: MatchId[] = [];
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      botActionDelayMs: 1_000,
      createDefaultMatch: false,
      onBotActionAccepted(matchId) {
        botUpdates.push(matchId);
      },
    },
  );
  const matchId = "bot-action-delay" as MatchId;
  const botPlayerId = premadeSetup.playerOrder[0];
  const createdPromise = registry.createMatch(
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
  await waitForBotMicrotasks();

  let resolved = false;
  void createdPromise.then(() => {
    resolved = true;
  });
  await waitForBotMicrotasks();

  assert.equal(resolved, true);
  assert.deepEqual(botUpdates, []);

  await vi.advanceTimersByTimeAsync(999);
  assert.deepEqual(botUpdates, []);

  await vi.advanceTimersByTimeAsync(1);
  await createdPromise;
  await waitForBotMicrotasks();

  assert.deepEqual(botUpdates, [matchId]);
});

test("bot players wait for the action delay before building a decision snapshot", async () => {
  vi.useFakeTimers();
  const chooseAction = vi.fn<BotStrategy["chooseAction"]>(() => undefined);
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    {
      botActionDelayMs: 1_000,
      botStrategy: { chooseAction },
      createDefaultMatch: false,
    },
  );
  const matchId = "bot-snapshot-after-delay" as MatchId;
  const botPlayerId = premadeSetup.playerOrder[0];
  const createdPromise = registry.createMatch(
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
  await waitForBotMicrotasks();

  assert.equal(chooseAction.mock.calls.length, 0);

  await vi.advanceTimersByTimeAsync(1_000);
  await createdPromise;
  await waitForBotMicrotasks();

  assert.equal(chooseAction.mock.calls.length, 1);
});
