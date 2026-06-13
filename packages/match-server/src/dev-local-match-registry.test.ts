import { strict as assert } from "node:assert";
import { beforeAll, test } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

import { requestHash } from "./action-envelope.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import {
  createLocalDevMatchRegistry,
  type CreatedDevMatchResponse,
} from "./dev-local-match-registry.js";
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
