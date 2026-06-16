import { strict as assert } from "node:assert";
import { afterEach, beforeAll, test, vi } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

import { requestHash } from "./action-envelope.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import {
  createLocalDevMatchRegistry,
  type CreatedDevMatchResponse,
} from "./dev-local-match-registry.js";
import type { BotStrategy } from "./bot-types.js";
import type { DevMatchSetup } from "./local-match.js";
import type { MatchTimerPolicy } from "./match-timers.js";
import type {
  ClientActionEnvelope,
  SessionActionRequest,
} from "./session-types.js";

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

const resolveFirstPlayerChoice = (
  registry: Awaited<ReturnType<typeof createLocalDevMatchRegistry>>,
  created: CreatedDevMatchResponse,
): void => {
  const result = registry.chooseFirstPlayer(
    created.matchId,
    created.firstPlayerChoice.chooserPlayerId,
    "goFirst",
  );
  if (typeof result === "string") {
    throw new Error(`Unable to choose first player: ${result}`);
  }
};

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
  resolveFirstPlayerChoice(registry, created);

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
  const ready = registry.chooseFirstPlayer(
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
  const ready = registry.chooseFirstPlayer(
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

  const ready = registry.chooseFirstPlayer(matchId, chooser, "goFirst");
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
  const ready = registry.chooseFirstPlayer(matchId, chooser, "goFirst");

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
