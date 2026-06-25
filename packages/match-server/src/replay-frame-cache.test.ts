import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { CompletedMatchReplayDetail } from "./postgres-completed-match.js";
import { createReplayFrameCache } from "./replay-frame-cache.js";

const replayDetail = (): CompletedMatchReplayDetail => ({
  matchId: "match-1",
  status: "completed",
  gameType: "dev",
  formatId: "dev",
  lobbyId: null,
  winnerUserId: null,
  winnerSeatId: "p1",
  startedAt: "2026-06-13T00:00:00.000Z",
  endedAt: "2026-06-13T00:10:00.000Z",
  turnCount: 1,
  actionCount: 3,
  players: [],
  replay: {
    replayFormatVersion: "dev-local-v2",
    artifactSha256: "artifact-1",
  },
});

describe("replay frame cache", () => {
  test("reconstructs a replay once and serves frame windows from cache", () => {
    let reconstructCalls = 0;
    const cache = createReplayFrameCache({
      reconstruct: () => {
        reconstructCalls += 1;
        return {
          status: "ready",
          frames: [
            { index: 0, actionIndex: -1, label: "start", snapshot: {} },
            { index: 1, actionIndex: 0, label: "playCard", snapshot: {} },
            { index: 2, actionIndex: 1, label: "end", snapshot: {} },
          ],
        };
      },
    });

    const first = cache.getFrameChunk(replayDetail(), { start: 0, limit: 2 });
    const second = cache.getFrameChunk(replayDetail(), { start: 2, limit: 2 });

    assert.equal(reconstructCalls, 1);
    assert.deepEqual(first, {
      status: "ready",
      frameCount: 3,
      start: 0,
      limit: 2,
      frames: [
        { index: 0, actionIndex: -1, label: "start", snapshot: {} },
        { index: 1, actionIndex: 0, label: "playCard", snapshot: {} },
      ],
    });
    assert.deepEqual(second, {
      status: "ready",
      frameCount: 3,
      start: 2,
      limit: 2,
      frames: [{ index: 2, actionIndex: 1, label: "end", snapshot: {} }],
    });
  });
});
