import { describe, expect, test } from "vitest";

import {
  createPostgresCompletedMatchRepository,
  createPostgresCompletedMatchReplayRepository,
  type CompletedMatchRecord,
} from "./postgres-completed-match.js";
import type { MatchId, PlayerId } from "@optcg/types";

const matchId = "match-1" as MatchId;
const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const completedMatchRecord = (): CompletedMatchRecord => ({
  matchId,
  status: "completed",
  gameType: "unranked",
  formatId: "standard-bo1",
  ladderId: null,
  lobbyId: "lobby-1",
  queueId: null,
  creationSource: {
    type: "customLobby",
    lobbyId: "lobby-1",
    lobbyConfigId: "config-1",
  },
  spectatorPolicy: { mode: "disabled" },
  disconnectPolicy: { mode: "casual-timeout" },
  rollbackPolicy: { mode: "mutual-consent" },
  runtimeVersions: { matchServer: "test" },
  cardManifestHash: "manifest-hash",
  cardManifestSnapshot: { cards: [] },
  firstPlayerSeatId: p1,
  firstPlayerChooserSeatId: p2,
  winnerUserId: "00000000-0000-0000-0000-000000000001",
  winnerSeatId: p1,
  resultReason: "concede",
  winType: "concede",
  startedAt: "2026-06-08T00:00:00.000Z",
  endedAt: "2026-06-08T00:10:00.000Z",
  turnCount: 4,
  actionCount: 2,
  finalStateHash: "final-hash",
  finalStateSeq: 12,
  errorPayload: null,
  players: [
    {
      seatId: p1,
      userId: "00000000-0000-0000-0000-000000000001",
      savedDeckId: "10000000-0000-0000-0000-000000000001",
      handoffTokenId: "20000000-0000-0000-0000-000000000001",
      displayName: "Winner",
      leaderCardNumber: "OP01-001",
      leaderVariantIndex: 0,
      deckHash: "winner-hash",
      deckSnapshot: { source: "winner deck snapshot" },
      resolvedLoadoutSnapshot: { source: "winner loadout snapshot" },
      cosmeticSnapshot: { deckSleeveId: "sleeve-1" },
      startingDeckOrderHash: "winner-order",
      result: "win",
      resultReason: "concede",
      wentFirst: true,
      choseFirst: false,
      isWinner: true,
      finalLifeCount: 3,
    },
    {
      seatId: p2,
      userId: "00000000-0000-0000-0000-000000000002",
      savedDeckId: "10000000-0000-0000-0000-000000000002",
      handoffTokenId: "20000000-0000-0000-0000-000000000002",
      displayName: "Loser",
      leaderCardNumber: "OP05-060",
      leaderVariantIndex: 1,
      deckHash: "loser-hash",
      deckSnapshot: { source: "loser deck snapshot" },
      resolvedLoadoutSnapshot: { source: "loser loadout snapshot" },
      cosmeticSnapshot: { deckSleeveId: "sleeve-2" },
      startingDeckOrderHash: "loser-order",
      result: "loss",
      resultReason: "concede",
      wentFirst: false,
      choseFirst: true,
      isWinner: false,
      finalLifeCount: 0,
    },
  ],
  replay: {
    replayFormatVersion: "1",
    engineVersion: "engine-test",
    rulesVersion: "rules-test",
    cardDataVersion: "cards-test",
    effectDefinitionsVersion: "effects-test",
    customHandlerVersion: "handlers-test",
    banlistVersion: "banlist-test",
    protocolVersion: "protocol-test",
    rngAlgorithm: "test-fixed",
    rngSeedCommitment: "seed-commitment",
    rngSeedRevealed: "seed",
    manifestHash: "manifest-hash",
    manifestSnapshot: { cards: [] },
    initialStateHash: "initial-hash",
    finalStateHash: "final-hash",
    initialSnapshot: null,
    initialDeckOrders: { p1: [], p2: [] },
    deterministicEntries: [{ type: "action" }],
    auditEntries: [],
    checkpoints: [],
    finalState: { status: "completed" },
    compressed: false,
    artifactStorage: null,
    artifactKey: null,
    artifactSha256: null,
    artifactSizeBytes: null,
  },
});

describe("Postgres completed match repository", () => {
  test("persists match, player snapshots, and replay inside one transaction", async () => {
    const calls: Array<{
      readonly sql: string;
      readonly params: readonly unknown[];
    }> = [];
    const transactions: string[] = [];
    const repository = createPostgresCompletedMatchRepository({
      async transaction(callback) {
        transactions.push("begin");
        const result = await callback((sql, params = []) => {
          calls.push({ sql, params });
          return Promise.resolve({});
        });
        transactions.push("commit");
        return result;
      },
    });

    await repository.saveCompletedMatch(completedMatchRecord());

    expect(transactions).toEqual(["begin", "commit"]);
    expect(calls).toHaveLength(4);
    expect(calls[0]?.sql).toContain("INSERT INTO sim.matches");
    expect(calls[1]?.sql).toContain("INSERT INTO sim.match_players");
    expect(calls[2]?.sql).toContain("INSERT INTO sim.match_players");
    expect(calls[3]?.sql).toContain("INSERT INTO sim.match_replays");
    expect(calls[1]?.params[9]).toBe(
      JSON.stringify({ source: "winner deck snapshot" }),
    );
    expect(calls[1]?.params[10]).toBe(
      JSON.stringify({ source: "winner loadout snapshot" }),
    );
  });

  test("propagates transaction failure without running later writes", async () => {
    const calls: string[] = [];
    const repository = createPostgresCompletedMatchRepository({
      async transaction(callback) {
        return callback((sql) => {
          calls.push(sql);
          if (sql.includes("sim.match_players")) {
            return Promise.reject(new Error("player insert failed"));
          }
          return Promise.resolve({});
        });
      },
    });

    await expect(
      repository.saveCompletedMatch(completedMatchRecord()),
    ).rejects.toThrow(/player insert failed/u);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("INSERT INTO sim.matches");
    expect(calls[1]).toContain("INSERT INTO sim.match_players");
  });

  test("can target the dev persistence schema", async () => {
    const calls: string[] = [];
    const repository = createPostgresCompletedMatchRepository({
      schema: "sim_dev",
      async transaction(callback) {
        return callback((sql) => {
          calls.push(sql);
          return Promise.resolve({});
        });
      },
    });

    await repository.saveCompletedMatch(completedMatchRecord());

    expect(calls[0]).toContain("INSERT INTO sim_dev.matches");
    expect(calls[1]).toContain("INSERT INTO sim_dev.match_players");
    expect(calls[3]).toContain("INSERT INTO sim_dev.match_replays");
  });

  test("rejects invalid schema names", () => {
    expect(() =>
      createPostgresCompletedMatchRepository({
        schema: "sim; drop schema auth",
      }),
    ).toThrow(/Invalid completed match schema name/u);
  });
});

describe("Postgres completed match replay repository", () => {
  test("lists replay summaries without requiring player participation", async () => {
    const calls: Array<{
      readonly sql: string;
      readonly params: readonly unknown[];
    }> = [];
    const repository = createPostgresCompletedMatchReplayRepository({
      schema: "sim_dev",
      query(sql, params = []) {
        calls.push({ sql, params });
        return Promise.resolve({
          rows: [
            {
              match_id: "match-1",
              status: "completed",
              game_type: "dev",
              format_id: "dev",
              lobby_id: "lobby-1",
              winner_user_id: "user-1",
              winner_seat_id: "p1",
              started_at: "2026-06-13T00:00:00.000Z",
              ended_at: "2026-06-13T00:10:00.000Z",
              turn_count: 4,
              action_count: 12,
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
            },
          ],
        });
      },
    });

    const summaries = await repository.listReplays();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("FROM sim_dev.matches");
    expect(calls[0]?.sql).not.toContain("viewer.user_id");
    expect(calls[0]?.params).toEqual([25]);
    expect(summaries).toEqual([
      {
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
      },
    ]);
  });

  test("returns replay detail without requiring player participation", async () => {
    const calls: Array<{
      readonly sql: string;
      readonly params: readonly unknown[];
    }> = [];
    const repository = createPostgresCompletedMatchReplayRepository({
      schema: "sim_dev",
      query(sql, params = []) {
        calls.push({ sql, params });
        return Promise.resolve({
          rows: [
            {
              match_id: "match-1",
              status: "completed",
              game_type: "dev",
              format_id: "dev",
              lobby_id: "lobby-1",
              winner_user_id: "user-1",
              winner_seat_id: "p1",
              started_at: "2026-06-13T00:00:00.000Z",
              ended_at: "2026-06-13T00:10:00.000Z",
              turn_count: 4,
              action_count: 12,
              players: [],
              replay: { deterministicEntries: [{ type: "action" }] },
            },
          ],
        });
      },
    });

    const detail = await repository.getReplay(matchId);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).not.toContain("viewer.user_id");
    expect(calls[0]?.sql).toContain("m.id = $1");
    expect(calls[0]?.sql).toContain("LEFT JOIN LATERAL");
    expect(calls[0]?.sql).not.toContain("GROUP BY m.id, replay.match_id");
    expect(calls[0]?.params).toEqual([matchId]);
    expect(detail?.matchId).toBe("match-1");
    expect(detail?.replay).toEqual({
      deterministicEntries: [{ type: "action" }],
    });
  });
});
