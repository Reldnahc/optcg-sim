import { describe, expect, test } from "vitest";

import type {
  CompletedMatchReplayDetail,
  JsonObject,
} from "./postgres-completed-match.js";
import { createDefaultDevFixtureFetch } from "./default-dev-fixture-fetch.test-support.js";
import {
  createLocalDevMatch,
  createPremadeDevMatchSetup,
} from "./local-match.js";
import { reconstructReplayFrames } from "./replay-frame-reconstruction.js";

const detail = (replay: JsonObject): CompletedMatchReplayDetail => ({
  matchId: "match-1",
  status: "completed",
  gameType: "dev",
  formatId: "dev",
  lobbyId: "lobby-1",
  winnerUserId: null,
  winnerSeatId: "p1",
  startedAt: "2026-06-13T00:00:00.000Z",
  endedAt: "2026-06-13T00:10:00.000Z",
  turnCount: 1,
  actionCount: 1,
  players: [
    {
      seatId: "p1",
      userId: null,
      displayName: "Player",
      leaderCardNumber: "OP01-001",
      result: "win",
      isWinner: true,
    },
  ],
  replay,
});

const snapshot = {
  stateSeq: 1,
  actionSeq: 0,
  stateHash: "hash-1",
  status: "mulligan",
  activePlayerId: "p1",
  players: {
    p1: {
      view: { self: {}, opponent: {}, timers: { players: {} } },
      actions: [],
    },
  },
};

describe("reconstructReplayFrames", () => {
  test("uses saved deterministic snapshots as compatibility frames", () => {
    const result = reconstructReplayFrames(
      detail({
        replayFormatVersion: "dev-local-v1",
        manifestSnapshot: { cards: {} },
        deterministicEntries: [
          { envelope: { request: { type: "playCard" } }, result: { snapshot } },
        ],
      }),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.frames).toEqual([
      {
        index: 0,
        actionIndex: 0,
        label: "playCard",
        snapshot,
      },
    ]);
  });

  test("reconstructs frames from initial engine state when saved snapshots are absent", async () => {
    const setup = await createPremadeDevMatchSetup({
      fetchCard: createDefaultDevFixtureFetch(),
    });
    const match = createLocalDevMatch(setup);
    const result = reconstructReplayFrames(
      detail({
        replayFormatVersion: "dev-local-v1",
        initialSnapshot: match.state,
        finalState: match.state,
        deterministicEntries: [],
      }),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }
    expect(result.frames[0]?.label).toBe("Initial state");
    expect(result.frames[0]?.snapshot).toMatchObject({
      stateSeq: match.state.seq,
      actionSeq: match.state.actionSeq,
    });
  });

  test("fails closed when no frame or reconstruction data exists", () => {
    const result = reconstructReplayFrames(
      detail({
        replayFormatVersion: "dev-local-v1",
        deterministicEntries: [],
      }),
    );

    expect(result).toEqual({
      status: "failed",
      reason:
        "Replay artifact does not contain saved frames or reconstructable engine state.",
    });
  });
});
