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
  test("caches reconstructed replay frame windows independently", async () => {
    let reconstructCalls = 0;
    const cache = createReplayFrameCache({
      reconstruct(_detail, window) {
        reconstructCalls += 1;
        assert.deepEqual(window, {
          start: reconstructCalls === 1 ? 0 : 2,
          limit: 2,
        });
        return Promise.resolve({
          status: "ready",
          frameCount: 3,
          frames: [
            reconstructCalls === 1
              ? { index: 0, actionIndex: -1, label: "start", snapshot: {} }
              : { index: 2, actionIndex: 1, label: "end", snapshot: {} },
          ],
        });
      },
    });

    const [first, repeated, second] = await Promise.all([
      cache.getFrameChunk(replayDetail(), { start: 0, limit: 2 }),
      cache.getFrameChunk(replayDetail(), { start: 0, limit: 2 }),
      cache.getFrameChunk(replayDetail(), { start: 2, limit: 2 }),
    ]);

    assert.equal(reconstructCalls, 2);
    assert.deepEqual(first, {
      status: "ready",
      frameCount: 3,
      start: 0,
      limit: 2,
      frames: [{ index: 0, actionIndex: -1, label: "start", snapshot: {} }],
    });
    assert.deepEqual(repeated, first);
    assert.deepEqual(second, {
      status: "ready",
      frameCount: 3,
      start: 2,
      limit: 2,
      frames: [{ index: 2, actionIndex: 1, label: "end", snapshot: {} }],
    });
  });
});
