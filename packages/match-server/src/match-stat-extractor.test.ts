import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { CompletedMatchRecord } from "./postgres-completed-match.js";
import type { MatchId, PlayerId } from "@optcg/types";
import {
  extractCompletedMatchStatOperations,
  type UserStatOperation,
} from "./match-stat-extractor.js";

const firstUserId = "00000000-0000-0000-0000-000000000001";
const secondUserId = "00000000-0000-0000-0000-000000000002";
const matchId = "11111111-1111-1111-1111-111111111111" as MatchId;
const firstSeatId = "p1" as PlayerId;
const secondSeatId = "p2" as PlayerId;

const operationKey = (operation: UserStatOperation): string =>
  `${operation.userId}|${operation.statKey}|${operation.operation}|${operation.value}`;

const operationKeys = (record: CompletedMatchRecord): ReadonlySet<string> =>
  new Set(extractCompletedMatchStatOperations(record).map(operationKey));

const expectOperation = (
  operations: ReadonlySet<string>,
  userId: string,
  statKey: string,
  value = 1,
): void => {
  assert.equal(
    operations.has(`${userId}|${statKey}|increment|${value}`),
    true,
    `Missing ${userId} ${statKey} ${value}`,
  );
};

const expectNoStat = (
  operations: ReadonlySet<string>,
  statKey: string,
): void => {
  assert.equal(
    [...operations].some((operation) =>
      operation.includes(`|${statKey}|increment|`),
    ),
    false,
    `Unexpected ${statKey}`,
  );
};

const expectNoOperation = (
  operations: ReadonlySet<string>,
  userId: string,
  statKey: string,
): void => {
  assert.equal(
    [...operations].some((operation) =>
      operation.startsWith(`${userId}|${statKey}|`),
    ),
    false,
    `Unexpected ${userId} ${statKey}`,
  );
};

const completedRecord = (
  overrides: Partial<CompletedMatchRecord> = {},
): CompletedMatchRecord => ({
  matchId,
  status: "completed",
  gameType: "ranked",
  formatId: "standard",
  ladderId: null,
  lobbyId: null,
  queueId: null,
  creationSource: { type: "dev" },
  spectatorPolicy: {},
  disconnectPolicy: {},
  rollbackPolicy: {},
  runtimeVersions: {},
  cardManifestHash: "manifest-hash",
  cardManifestSnapshot: {
    cards: {
      "OP01-001": {
        name: "Monkey.D.Luffy",
        colors: ["red"],
      },
      "OP05-060": {
        name: "Monkey.D.Luffy",
        colors: ["purple", "black"],
      },
    },
  },
  firstPlayerSeatId: firstSeatId,
  firstPlayerChooserSeatId: firstSeatId,
  winnerUserId: firstUserId,
  winnerSeatId: firstSeatId,
  resultReason: "completed",
  winType: "game",
  startedAt: "2026-06-28T12:00:00.000Z",
  endedAt: "2026-06-28T12:32:00.000Z",
  turnCount: 12,
  actionCount: 48,
  finalStateHash: "final-hash",
  finalStateSeq: 50,
  errorPayload: null,
  players: [
    {
      seatId: firstSeatId,
      userId: firstUserId,
      savedDeckId: null,
      handoffTokenId: null,
      displayName: "Winner",
      leaderCardNumber: "OP01-001",
      leaderVariantIndex: null,
      deckHash: null,
      deckSnapshot: {},
      resolvedLoadoutSnapshot: {},
      cosmeticSnapshot: {},
      startingDeckOrderHash: null,
      result: "win",
      resultReason: "completed",
      wentFirst: true,
      choseFirst: true,
      isWinner: true,
      finalLifeCount: 1,
    },
    {
      seatId: secondSeatId,
      userId: secondUserId,
      savedDeckId: null,
      handoffTokenId: null,
      displayName: "Loser",
      leaderCardNumber: "OP05-060",
      leaderVariantIndex: null,
      deckHash: null,
      deckSnapshot: {},
      resolvedLoadoutSnapshot: {},
      cosmeticSnapshot: {},
      startingDeckOrderHash: null,
      result: "loss",
      resultReason: "completed",
      wentFirst: false,
      choseFirst: false,
      isWinner: false,
      finalLifeCount: 0,
    },
  ],
  replay: {
    replayFormatVersion: "test",
    engineVersion: "test",
    rulesVersion: "test",
    cardDataVersion: "test",
    effectDefinitionsVersion: "test",
    customHandlerVersion: "test",
    banlistVersion: "test",
    protocolVersion: "test",
    rngAlgorithm: "test-fixed",
    rngSeedCommitment: null,
    rngSeedRevealed: null,
    manifestHash: "manifest-hash",
    manifestSnapshot: {},
    initialStateHash: "initial-hash",
    finalStateHash: "final-hash",
    initialSnapshot: null,
    initialDeckOrders: null,
    deterministicEntries: [],
    auditEntries: [],
    checkpoints: [],
    finalState: null,
    compressed: false,
    artifactStorage: null,
    artifactKey: null,
    artifactSha256: null,
    artifactSizeBytes: null,
  },
  ...overrides,
});

const playerAt = (
  record: CompletedMatchRecord,
  index: number,
): CompletedMatchRecord["players"][number] => {
  const player = record.players[index];
  if (player === undefined) {
    throw new Error(`Missing test player at index ${index}`);
  }
  return player;
};

describe("completed match stat extraction", () => {
  test.each(["abandoned", "errored", "no_contest"] as const)(
    "fails closed for %s completed-match records",
    (status) => {
      const record = completedRecord({
        status,
        resultReason: status,
        winType: null,
        winnerUserId: null,
        winnerSeatId: null,
      });

      assert.deepEqual(extractCompletedMatchStatOperations(record), []);
    },
  );

  test("extracts summary stats for a completed match with two account users", () => {
    const operations = operationKeys(completedRecord());

    expectOperation(operations, firstUserId, "matches_completed");
    expectOperation(operations, firstUserId, "matches_won");
    expectOperation(operations, firstUserId, "pvp_matches_completed");
    expectOperation(operations, firstUserId, "pvp_matches_won");
    expectOperation(
      operations,
      firstUserId,
      "format_matches_completed:standard",
    );
    expectOperation(operations, firstUserId, "format_matches_won:standard");
    expectOperation(
      operations,
      firstUserId,
      "game_type_matches_completed:ranked",
    );
    expectOperation(operations, firstUserId, "game_type_matches_won:ranked");
    expectOperation(operations, firstUserId, "ranked_matches_completed");
    expectOperation(operations, firstUserId, "ranked_matches_won");
    expectOperation(operations, firstUserId, "matches_started_first");
    expectOperation(operations, firstUserId, "matches_won_started_first");
    expectOperation(operations, firstUserId, "total_turns_played", 12);
    expectNoOperation(operations, firstUserId, "total_actions_taken");
    expectOperation(operations, firstUserId, "total_match_seconds", 1920);
    expectOperation(operations, firstUserId, "long_matches_completed");
    expectOperation(
      operations,
      firstUserId,
      "daily_matches_completed:2026-06-28",
    );
    expectOperation(
      operations,
      firstUserId,
      "weekly_matches_completed:2026-26",
    );
    expectOperation(
      operations,
      firstUserId,
      "monthly_matches_completed:2026-06",
    );
    expectOperation(
      operations,
      firstUserId,
      "leader_matches_completed:OP01-001",
    );
    expectOperation(operations, firstUserId, "leader_matches_won:OP01-001");
    expectOperation(
      operations,
      firstUserId,
      "leader_name_matches_completed:monkey-d-luffy",
    );
    expectOperation(
      operations,
      firstUserId,
      "leader_name_matches_won:monkey-d-luffy",
    );
    expectOperation(
      operations,
      firstUserId,
      "leader_color_matches_completed:mono-red",
    );
    expectOperation(
      operations,
      firstUserId,
      "leader_color_matches_won:mono-red",
    );

    expectOperation(operations, secondUserId, "matches_completed");
    expectOperation(operations, secondUserId, "matches_lost");
    expectOperation(operations, secondUserId, "pvp_matches_completed");
    expectOperation(operations, secondUserId, "matches_started_second");
    expectOperation(operations, secondUserId, "total_turns_played", 12);
    expectNoOperation(operations, secondUserId, "total_actions_taken");
    expectOperation(operations, secondUserId, "total_match_seconds", 1920);
    expectOperation(operations, secondUserId, "leader_matches_lost:OP05-060");
    expectOperation(
      operations,
      secondUserId,
      "leader_color_matches_lost:purple-black",
    );
  });

  test("extracts draw outcome stats and leader drawn stats", () => {
    const record = completedRecord({
      status: "draw",
      winnerUserId: null,
      winnerSeatId: null,
      players: completedRecord().players.map((player) => ({
        ...player,
        result: "draw",
        isWinner: false,
      })),
    });
    const operations = operationKeys(record);

    expectOperation(operations, firstUserId, "matches_drawn");
    expectOperation(operations, firstUserId, "leader_matches_drawn:OP01-001");
    expectOperation(
      operations,
      firstUserId,
      "leader_name_matches_drawn:monkey-d-luffy",
    );
    expectOperation(operations, secondUserId, "matches_drawn");
    expectOperation(operations, secondUserId, "leader_matches_drawn:OP05-060");
  });

  test("maps match-level concede to the losing player as conceder", () => {
    const operations = operationKeys(
      completedRecord({
        resultReason: "concede",
        winType: "concede",
        players: completedRecord().players.map((player) => ({
          ...player,
          resultReason: null,
        })),
      }),
    );

    expectOperation(operations, secondUserId, "matches_conceded");
    expectOperation(operations, firstUserId, "matches_opponent_conceded");
  });

  test("maps player-level concede reason when match-level reason is completed", () => {
    const base = completedRecord();
    const operations = operationKeys(
      completedRecord({
        resultReason: "completed",
        winType: "game",
        players: [
          playerAt(base, 0),
          {
            ...playerAt(base, 1),
            resultReason: "player_concede",
          },
        ],
      }),
    );

    expectOperation(operations, secondUserId, "matches_conceded");
    expectOperation(operations, firstUserId, "matches_opponent_conceded");
  });

  test("uses ISO week-year keys at UTC year boundaries", () => {
    const operations = operationKeys(
      completedRecord({
        endedAt: "2027-01-01T00:00:00.000Z",
      }),
    );

    expectOperation(
      operations,
      firstUserId,
      "weekly_matches_completed:2026-53",
    );
    expectOperation(
      operations,
      secondUserId,
      "weekly_matches_completed:2026-53",
    );
  });

  test("extracts bot and novice bot stats for account users but not synthetic bots", () => {
    const base = completedRecord();
    const record = completedRecord({
      gameType: "dev",
      players: [
        {
          ...playerAt(base, 0),
          result: "loss",
          isWinner: false,
        },
        {
          ...playerAt(base, 1),
          userId: null,
          displayName: "Bot",
          result: "win",
          isWinner: true,
          isBot: true,
          botDifficulty: "novice",
        },
      ],
    });
    const operations = operationKeys(record);

    expectOperation(operations, firstUserId, "bot_matches_completed");
    expectOperation(operations, firstUserId, "novice_bot_matches_completed");
    expectOperation(operations, firstUserId, "matches_lost");
    assert.equal(
      [...operations].some((operation) => operation.startsWith("bot|")),
      false,
    );
  });

  test("extracts bot win stats for an account user who beats a novice bot", () => {
    const base = completedRecord();
    const record = completedRecord({
      gameType: "dev",
      endedAt: "2026-06-28T12:04:59.000Z",
      players: [
        playerAt(base, 0),
        {
          ...playerAt(base, 1),
          userId: null,
          displayName: "Practice Opponent",
          isBot: true,
          botDifficulty: "novice",
        },
      ],
    });
    const operations = operationKeys(record);

    expectOperation(operations, firstUserId, "bot_matches_completed");
    expectOperation(operations, firstUserId, "bot_matches_won");
    expectOperation(operations, firstUserId, "novice_bot_matches_completed");
    expectOperation(operations, firstUserId, "novice_bot_matches_won");
    expectOperation(operations, firstUserId, "quick_wins");
  });

  test("extracts advanced bot stats from completed-record metadata", () => {
    const base = completedRecord();
    const record = completedRecord({
      gameType: "dev",
      players: [
        playerAt(base, 0),
        {
          ...playerAt(base, 1),
          userId: null,
          displayName: "Advanced Practice Opponent",
          isBot: true,
          botDifficulty: "advanced",
        },
      ],
    });
    const operations = operationKeys(record);

    expectOperation(operations, firstUserId, "bot_matches_completed");
    expectOperation(operations, firstUserId, "bot_matches_won");
    expectOperation(operations, firstUserId, "advanced_bot_matches_completed");
    expectOperation(operations, firstUserId, "advanced_bot_matches_won");
    expectNoStat(operations, "novice_bot_matches_completed");
  });

  test("does not infer bots from display names alone", () => {
    const base = completedRecord();
    const record = completedRecord({
      players: [
        playerAt(base, 0),
        {
          ...playerAt(base, 1),
          displayName: "Bot",
        },
      ],
    });
    const operations = operationKeys(record);

    expectOperation(operations, firstUserId, "pvp_matches_completed");
    expectNoStat(operations, "bot_matches_completed");
  });

  test("missing leader metadata fails closed to exact leader card stats", () => {
    const operations = operationKeys(
      completedRecord({
        cardManifestSnapshot: { cards: {} },
      }),
    );

    expectOperation(
      operations,
      firstUserId,
      "leader_matches_completed:OP01-001",
    );
    expectOperation(operations, firstUserId, "leader_matches_won:OP01-001");
    expectNoStat(operations, "leader_name_matches_completed:monkey-d-luffy");
    expectNoStat(operations, "leader_color_matches_completed:mono-red");
  });

  test("invalid leader metadata fails closed to exact leader card stats", () => {
    const operations = operationKeys(
      completedRecord({
        cardManifestSnapshot: {
          cards: {
            "OP01-001": {
              name: "!!!",
              colors: ["white"],
            },
          },
        },
      }),
    );

    expectOperation(
      operations,
      firstUserId,
      "leader_matches_completed:OP01-001",
    );
    expectOperation(operations, firstUserId, "leader_matches_won:OP01-001");
    expectNoStat(operations, "leader_name_matches_completed");
    expectNoStat(operations, "leader_color_matches_completed");
  });

  test("does not emit ranked or casual stats without explicit game metadata", () => {
    const operations = operationKeys(completedRecord({ gameType: "dev" }));

    expectOperation(operations, firstUserId, "game_type_matches_completed:dev");
    expectNoStat(operations, "ranked_matches_completed");
    expectNoStat(operations, "casual_matches_completed");
  });

  test("skips duration stats when timestamps are invalid", () => {
    const operations = operationKeys(
      completedRecord({
        startedAt: "not-a-date",
        endedAt: "2026-06-28T12:04:59.000Z",
      }),
    );

    expectNoStat(operations, "total_match_seconds");
    expectNoStat(operations, "quick_wins");
  });
});
