import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, test } from "vitest";
import type { MatchId } from "@optcg/types";

import { createMatchHttpServer } from "./match-http-server.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import type {
  CompletedMatchReplayDetail,
  CompletedMatchReplayRepository,
  CompletedMatchReplaySummary,
} from "./postgres-completed-match.js";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const replaySummary = (): CompletedMatchReplaySummary => ({
  matchId: "match-1",
  status: "completed",
  gameType: "dev",
  formatId: "dev",
  lobbyId: "lobby-1",
  winnerUserId: "user-1",
  winnerSeatId: "p1",
  startedAt: "2026-06-13T00:00:00.000Z",
  endedAt: "2026-06-13T00:10:00.000Z",
  turnCount: 4,
  actionCount: 12,
  players: [
    {
      seatId: "p1",
      userId: "user-1",
      displayName: "Winner",
      leaderCardNumber: "OP01-001",
      result: "win",
      isWinner: true,
    },
  ],
});

const replayDetail = (): CompletedMatchReplayDetail => ({
  ...replaySummary(),
  replay: {
    replayFormatVersion: "dev-local-v1",
    deterministicEntries: [
      {
        envelope: { request: { type: "playCard" } },
        result: {
          snapshot: {
            stateSeq: 1,
            actionSeq: 1,
            stateHash: "hash-1",
            status: "main",
            activePlayerId: "p1",
            players: {
              p1: {
                view: { self: {}, opponent: {}, timers: { players: {} } },
                actions: [],
              },
            },
          },
        },
      },
    ],
  },
});

const assertReplayDetailBody = async (response: Response): Promise<void> => {
  const body = (await response.json()) as {
    replay?: CompletedMatchReplayDetail;
    frameReconstruction?: {
      status?: string;
      frames?: Array<{ label?: string }>;
    };
  };
  assert.equal(body.replay?.matchId, "match-1");
  assert.deepEqual(body.frameReconstruction, {
    status: "ready",
    frames: [
      {
        index: 0,
        actionIndex: 0,
        label: "playCard",
        snapshot: {
          stateSeq: 1,
          actionSeq: 1,
          stateHash: "hash-1",
          status: "main",
          activePlayerId: "p1",
          players: {
            p1: {
              view: { self: {}, opponent: {}, timers: { players: {} } },
              actions: [],
            },
          },
        },
      },
    ],
  });
};

interface FakeReplayRepository extends CompletedMatchReplayRepository {
  readonly listCalls: number[];
  readonly detailCalls: MatchId[];
}

const createFakeReplayRepository = (): FakeReplayRepository => {
  const listCalls: number[] = [];
  const detailCalls: MatchId[] = [];
  return {
    listCalls,
    detailCalls,
    listReplays(limit = 25) {
      listCalls.push(limit);
      return Promise.resolve([replaySummary()]);
    },
    getReplay(matchId) {
      detailCalls.push(matchId);
      if (matchId !== "match-1") {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(replayDetail());
    },
  };
};

describe("match HTTP server replay routes", () => {
  test("lists replays without account auth", async () => {
    const repository = createFakeReplayRepository();
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays`);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { replays: [replaySummary()] });
      assert.deepEqual(repository.listCalls, [25]);
    } finally {
      await server.close();
    }
  });

  test("lists replays for the authenticated user", async () => {
    const repository = createFakeReplayRepository();
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays`, {
        headers: { "x-optcg-session-token": "user:user-1:session-1" },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { replays: [replaySummary()] });
      assert.deepEqual(repository.listCalls, [25]);
    } finally {
      await server.close();
    }
  });

  test("lists replays without waiting for active match recovery", async () => {
    const repository = createFakeReplayRepository();
    const basePersistence = createInMemoryMatchPersistence();
    let listStartedResolve: () => void = () => undefined;
    let releaseListResolve: () => void = () => undefined;
    const listStarted = new Promise<void>((resolve) => {
      listStartedResolve = resolve;
    });
    const releaseList = new Promise<void>((resolve) => {
      releaseListResolve = resolve;
    });
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
      matchPersistence: {
        ...basePersistence,
        async listActiveMatchIds() {
          listStartedResolve();
          await releaseList;
          return [];
        },
      },
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays`);
      const recoveryStarted = await Promise.race([
        listStarted.then(() => true),
        delay(25).then(() => false),
      ]);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { replays: [replaySummary()] });
      assert.equal(recoveryStarted, false);
    } finally {
      releaseListResolve();
      await server.close();
    }
  });

  test("returns replay detail for a participating user", async () => {
    const repository = createFakeReplayRepository();
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays/match-1`, {
        headers: { "x-optcg-session-token": "user:user-1:session-1" },
      });

      assert.equal(response.status, 200);
      await assertReplayDetailBody(response);
      assert.deepEqual(repository.detailCalls, ["match-1"]);
    } finally {
      await server.close();
    }
  });

  test("returns replay detail for a non-participant", async () => {
    const repository = createFakeReplayRepository();
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays/match-1`, {
        headers: { "x-optcg-session-token": "user:user-2:session-1" },
      });

      assert.equal(response.status, 200);
      await assertReplayDetailBody(response);
      assert.deepEqual(repository.detailCalls, ["match-1"]);
    } finally {
      await server.close();
    }
  });

  test("serves a local replay fixture when configured", async () => {
    const directory = await mkdtemp(join(tmpdir(), "optcg-replay-fixture-"));
    const fixturePath = join(directory, "replay.json");
    const previousFixturePath =
      process.env["PONEGLYPH_SIM_REPLAY_FIXTURE_PATH"];
    process.env["PONEGLYPH_SIM_REPLAY_FIXTURE_PATH"] = fixturePath;
    await writeFile(
      fixturePath,
      JSON.stringify({ replay: replayDetail() }),
      "utf8",
    );
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays/match-1`);

      assert.equal(response.status, 200);
      await assertReplayDetailBody(response);
    } finally {
      await server.close();
      if (previousFixturePath === undefined) {
        delete process.env["PONEGLYPH_SIM_REPLAY_FIXTURE_PATH"];
      } else {
        process.env["PONEGLYPH_SIM_REPLAY_FIXTURE_PATH"] = previousFixturePath;
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
});
