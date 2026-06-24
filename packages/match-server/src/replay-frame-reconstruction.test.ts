import { describe, expect, test } from "vitest";

import { hashReplayStateForScope } from "@optcg/engine-core";
import type { GameState, MatchId, PlayerId, StateSeq } from "@optcg/types";
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

const state = (
  seq: number,
  actionSeq: number,
  turnPlayerId = "p1",
): GameState =>
  ({
    matchId: "match-1" as MatchId,
    seq: seq as StateSeq,
    actionSeq,
    status: { type: "active" },
    players: {},
    eventJournal: [],
    timers: { players: {} },
    turn: {
      turnPlayerId: turnPlayerId as PlayerId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: {},
    },
  }) as unknown as GameState;

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

  test("reconstructs frames from compact seed and deck source when saved snapshots are absent", async () => {
    const setup = await createPremadeDevMatchSetup({
      fetchCard: createDefaultDevFixtureFetch(),
    });
    const match = createLocalDevMatch(setup);
    const result = reconstructReplayFrames(
      detail({
        replayFormatVersion: "dev-local-v1",
        rngSeedRevealed: String(setup.rngSeed),
        manifestSnapshot: setup.cardManifest,
        initialStateHash: "",
        finalStateHash: "stale-timer-inclusive-hash",
        initialSnapshot: null,
        finalState: null,
        initialDeckOrders: {
          playerOrder: setup.playerOrder,
          firstPlayerId: setup.firstPlayerId,
          shuffleDecks: setup.shuffleDecks ?? false,
          players: Object.fromEntries(
            setup.players.map((player) => [
              player.playerId,
              {
                leaderCardId: player.leaderCardId,
                leaderLifeCount: player.leaderLifeCount,
                deckCardIds: player.deckCardIds.map(String),
                donDeckCardIds: player.donDeckCardIds.map(String),
              },
            ]),
          ),
        },
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

  test("dev-local-v2 fails closed when deterministic entries are envelope-shaped", () => {
    const result = reconstructReplayFrames(
      detail({
        replayFormatVersion: "dev-local-v2",
        initialSnapshot: state(1, 0),
        deterministicEntries: [
          {
            envelope: { request: { type: "submitAction" } },
            result: { snapshot },
          },
        ],
      }),
    );

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toMatch(/deterministic/i);
    }
  });

  test("dev-local-v2 verifies final replay hash", () => {
    const result = reconstructReplayFrames(
      detail({
        replayFormatVersion: "dev-local-v2",
        initialSnapshot: state(1, 0),
        deterministicEntries: [],
        finalStateHash: "wrong-final-hash",
      }),
    );

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toMatch(/final hash/i);
    }
  });

  test("dev-local-v2 reconstructs rollback restore from replay checkpoints", () => {
    const initialState = state(1, 0);
    const restoredState = state(0, 0);
    const finalState = state(2, 1);
    const checkpoint = {
      checkpointVersion: "deterministic-checkpoint-v1",
      matchId: "match-1",
      checkpointId: "rollback:0:0:event-1",
      reason: "rollbackPoint",
      stateSeq: 0,
      actionSeq: 0,
      stateHash: hashReplayStateForScope(restoredState, "gameplay-v1"),
      hashScope: "gameplay-v1",
      snapshot: restoredState,
    };
    const entry = {
      formatVersion: "deterministic-entry-v1",
      matchId: "match-1",
      entrySeq: 0,
      kind: "system",
      operation: {
        type: "restoreRollbackPoint",
        rollbackPointId: checkpoint.checkpointId,
        requestedBy: "p1",
        approvedBy: "p2",
        restoredStateHash: hashReplayStateForScope(finalState, "gameplay-v1"),
        restoredStateSeq: 2,
        restoredActionSeq: 1,
      },
      verification: {
        stateSeqBefore: 1,
        actionSeqBefore: 0,
        stateHashBefore: hashReplayStateForScope(initialState, "gameplay-v1"),
        stateSeqAfter: 2,
        actionSeqAfter: 1,
        stateHashAfter: hashReplayStateForScope(finalState, "gameplay-v1"),
        hashScope: "gameplay-v1",
      },
    };

    const result = reconstructReplayFrames(
      detail({
        replayFormatVersion: "dev-local-v2",
        initialSnapshot: initialState,
        deterministicEntries: [entry],
        checkpoints: [checkpoint],
        finalStateHash: hashReplayStateForScope(finalState, "gameplay-v1"),
      }),
    );

    expect(result.status).toBe("ready");
  });
});
