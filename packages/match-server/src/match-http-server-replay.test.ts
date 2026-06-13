import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { MatchId } from "@optcg/types";

import { createMatchHttpServer } from "./match-http-server.js";
import type {
  CompletedMatchReplayDetail,
  CompletedMatchReplayRepository,
  CompletedMatchReplaySummary,
} from "./postgres-completed-match.js";

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
    deterministicEntries: [{ type: "submitAction" }],
  },
});

interface FakeReplayRepository extends CompletedMatchReplayRepository {
  readonly listCalls: string[];
  readonly detailCalls: Array<{
    readonly userId: string;
    readonly matchId: MatchId;
  }>;
}

const createFakeReplayRepository = (): FakeReplayRepository => {
  const listCalls: string[] = [];
  const detailCalls: Array<{
    readonly userId: string;
    readonly matchId: MatchId;
  }> = [];
  return {
    listCalls,
    detailCalls,
    listReplaysForUser(userId) {
      listCalls.push(userId);
      return Promise.resolve(userId === "user-1" ? [replaySummary()] : []);
    },
    getReplayForUser(userId, matchId) {
      detailCalls.push({ userId, matchId });
      if (userId !== "user-1" || matchId !== "match-1") {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(replayDetail());
    },
  };
};

describe("match HTTP server replay routes", () => {
  test("requires account auth to list replays", async () => {
    const repository = createFakeReplayRepository();
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      replayRepository: repository,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/replays`);

      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        errors: ["Account session is required."],
      });
      assert.deepEqual(repository.listCalls, []);
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
      assert.deepEqual(repository.listCalls, ["user-1"]);
    } finally {
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
      assert.deepEqual(await response.json(), { replay: replayDetail() });
      assert.deepEqual(repository.detailCalls, [
        { userId: "user-1", matchId: "match-1" },
      ]);
    } finally {
      await server.close();
    }
  });

  test("does not return replay detail for a non-participant", async () => {
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

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        errors: ["Replay match-1 not found."],
      });
      assert.deepEqual(repository.detailCalls, [
        { userId: "user-2", matchId: "match-1" },
      ]);
    } finally {
      await server.close();
    }
  });
});
