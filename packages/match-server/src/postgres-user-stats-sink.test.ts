import { strict as assert } from "node:assert";
import { test } from "vitest";

import type { MatchId } from "@optcg/types";

import {
  createPostgresUserStatsSink,
  type PostgresUserStatsQuery,
} from "./postgres-user-stats-sink.js";
import { statKeys } from "./user-stat-keys.js";

interface QueryCall {
  readonly sql: string;
  readonly params: readonly unknown[] | undefined;
}

const userOne = "00000000-0000-4000-8000-000000000001";
const userTwo = "00000000-0000-4000-8000-000000000002";

const jsonPayload = (call: QueryCall): readonly Record<string, unknown>[] => {
  const payload = call.params?.[2];
  if (typeof payload !== "string") {
    throw new Error("Expected JSON operation payload.");
  }
  return JSON.parse(payload) as readonly Record<string, unknown>[];
};

const createQueryRecorder = (
  rowsForCall: (
    sql: string,
    params: readonly unknown[] | undefined,
  ) => {
    readonly rows: readonly Record<string, unknown>[];
  },
): { readonly calls: QueryCall[]; readonly query: PostgresUserStatsQuery } => {
  const calls: QueryCall[] = [];
  return {
    calls,
    query(sql, params) {
      calls.push({ sql, params });
      return Promise.resolve(rowsForCall(sql, params));
    },
  };
};

const statBatchCall = (calls: readonly QueryCall[]): QueryCall => {
  const call = calls.find((candidate) =>
    /INSERT INTO auth\.user_stat_events/i.test(candidate.sql),
  );
  if (call === undefined) {
    throw new Error("Expected a user stat batch query.");
  }
  return call;
};

test("applies aggregated completed-match stats through one idempotent CTE and evaluates titles", async () => {
  const { calls, query } = createQueryRecorder((sql) => {
    if (/FROM auth\.user_stats/i.test(sql) && /stat_key = ANY/i.test(sql)) {
      return {
        rows: [
          { user_id: userOne, stat_key: statKeys.currentWinStreak, value: "2" },
        ],
      };
    }
    if (/INSERT INTO auth\.user_stat_events/i.test(sql)) {
      return { rows: [{ user_id: userOne }, { user_id: userOne }] };
    }
    if (/INSERT INTO auth\.user_title_unlocks/i.test(sql)) {
      return { rows: [] };
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  });
  const sink = createPostgresUserStatsSink(query);

  await sink.recordCompletedMatchStats({
    matchId: "match-1" as MatchId,
    operations: [
      {
        userId: userOne,
        statKey: statKeys.matchesWon,
        operation: "increment",
        value: 1,
      },
      {
        userId: userOne,
        statKey: statKeys.matchesWon,
        operation: "increment",
        value: 2,
      },
      { userId: userOne, statKey: "largest_turn", operation: "max", value: 4 },
      { userId: userOne, statKey: "largest_turn", operation: "max", value: 9 },
      {
        userId: userOne,
        statKey: "last_result_score",
        operation: "set",
        value: 3,
      },
      {
        userId: userOne,
        statKey: "last_result_score",
        operation: "set",
        value: 7,
      },
    ],
  });

  const batchCall = statBatchCall(calls);
  assert.match(batchCall.sql, /^\s*WITH\s+/i);
  assert.match(batchCall.sql, /INSERT INTO auth\.user_stat_events/i);
  assert.match(
    batchCall.sql,
    /ON CONFLICT\s*\(\s*source_type\s*,\s*source_id\s*,\s*user_id\s*,\s*stat_key\s*,\s*operation\s*\)\s*DO NOTHING/i,
  );
  assert.match(batchCall.sql, /INSERT INTO auth\.user_stats/i);
  assert.match(batchCall.sql, /RETURNING\s+user_id/i);
  assert.doesNotMatch(
    batchCall.sql,
    /match-1|00000000-0000-4000-8000-000000000001|largest_turn/,
  );
  assert.deepEqual(batchCall.params?.slice(0, 2), [
    "completed_match",
    "match-1",
  ]);
  assert.deepEqual(jsonPayload(batchCall), [
    {
      userId: userOne,
      statKey: statKeys.matchesWon,
      operation: "increment",
      value: "3",
    },
    { userId: userOne, statKey: "largest_turn", operation: "max", value: "9" },
    {
      userId: userOne,
      statKey: "last_result_score",
      operation: "set",
      value: "7",
    },
    {
      userId: userOne,
      statKey: statKeys.currentWinStreak,
      operation: "set",
      value: "3",
    },
    {
      userId: userOne,
      statKey: statKeys.bestWinStreak,
      operation: "max",
      value: "3",
    },
    {
      userId: userOne,
      statKey: statKeys.currentLossStreak,
      operation: "set",
      value: "0",
    },
  ]);
  const titleCalls = calls.filter((call) =>
    /INSERT INTO auth\.user_title_unlocks/i.test(call.sql),
  );
  assert.equal(titleCalls.length, 1);
  const [titleCall] = titleCalls;
  if (titleCall === undefined) {
    throw new Error("Expected one title unlock query.");
  }
  assert.deepEqual(titleCall.params, [userOne]);
  assert.match(
    titleCall.sql,
    /\(\s*req\.operator\s*=\s*'gte'\s+AND\s+stat\.value\s*>=\s*req\.threshold\s*\)\s+IS\s+NOT\s+TRUE/i,
  );
});

test("evaluates title unlocks for attempted users when stat events were already inserted", async () => {
  const { calls, query } = createQueryRecorder((sql) => {
    if (/FROM auth\.user_stats/i.test(sql) && /stat_key = ANY/i.test(sql)) {
      return { rows: [] };
    }
    if (/INSERT INTO auth\.user_stat_events/i.test(sql)) {
      return { rows: [] };
    }
    if (/INSERT INTO auth\.user_title_unlocks/i.test(sql)) {
      return { rows: [] };
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  });
  const sink = createPostgresUserStatsSink(query);

  await sink.recordCompletedMatchStats({
    matchId: "match-1-retry" as MatchId,
    operations: [
      {
        userId: userOne,
        statKey: statKeys.matchesCompleted,
        operation: "increment",
        value: 1,
      },
    ],
  });

  const titleCalls = calls.filter((call) =>
    /INSERT INTO auth\.user_title_unlocks/i.test(call.sql),
  );
  assert.equal(titleCalls.length, 1);
  assert.deepEqual(titleCalls[0]?.params, [userOne]);
});

test("rejects mixed operation kinds for the same user stat before writing", async () => {
  const { calls, query } = createQueryRecorder(() => {
    throw new Error("Query should not be called for invalid mixed operations.");
  });
  const sink = createPostgresUserStatsSink(query);

  await assert.rejects(
    () =>
      sink.recordCompletedMatchStats({
        matchId: "match-1" as MatchId,
        operations: [
          {
            userId: userOne,
            statKey: "same_stat",
            operation: "increment",
            value: 1,
          },
          { userId: userOne, statKey: "same_stat", operation: "set", value: 1 },
        ],
      }),
    /cannot mix operation kinds/i,
  );
  assert.equal(calls.length, 0);
});

test("rejects negative operation values before writing", async () => {
  const { calls, query } = createQueryRecorder(() => {
    throw new Error("Query should not be called for negative values.");
  });
  const sink = createPostgresUserStatsSink(query);

  await assert.rejects(
    () =>
      sink.recordCompletedMatchStats({
        matchId: "match-1" as MatchId,
        operations: [
          {
            userId: userOne,
            statKey: statKeys.matchesCompleted,
            operation: "increment",
            value: -1,
          },
        ],
      }),
    /non-negative integer/i,
  );
  assert.equal(calls.length, 0);
});

test("derives win loss and draw streak operations from original match outcomes", async () => {
  const { calls, query } = createQueryRecorder((sql) => {
    if (/FROM auth\.user_stats/i.test(sql) && /stat_key = ANY/i.test(sql)) {
      return {
        rows: [
          {
            user_id: userOne,
            stat_key: statKeys.currentLossStreak,
            value: "4",
          },
          { user_id: userTwo, stat_key: statKeys.currentWinStreak, value: "6" },
          {
            user_id: userTwo,
            stat_key: statKeys.currentLossStreak,
            value: "3",
          },
        ],
      };
    }
    if (/INSERT INTO auth\.user_stat_events/i.test(sql)) {
      return { rows: [{ user_id: userOne }, { user_id: userTwo }] };
    }
    if (/INSERT INTO auth\.user_title_unlocks/i.test(sql)) {
      return { rows: [] };
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  });
  const sink = createPostgresUserStatsSink(query);

  await sink.recordCompletedMatchStats({
    matchId: "match-2" as MatchId,
    operations: [
      {
        userId: userOne,
        statKey: statKeys.matchesLost,
        operation: "increment",
        value: 1,
      },
      {
        userId: userTwo,
        statKey: statKeys.matchesDrawn,
        operation: "increment",
        value: 1,
      },
    ],
  });

  assert.deepEqual(jsonPayload(statBatchCall(calls)), [
    {
      userId: userOne,
      statKey: statKeys.matchesLost,
      operation: "increment",
      value: "1",
    },
    {
      userId: userTwo,
      statKey: statKeys.matchesDrawn,
      operation: "increment",
      value: "1",
    },
    {
      userId: userOne,
      statKey: statKeys.currentLossStreak,
      operation: "set",
      value: "5",
    },
    {
      userId: userOne,
      statKey: statKeys.bestLossStreak,
      operation: "max",
      value: "5",
    },
    {
      userId: userOne,
      statKey: statKeys.currentWinStreak,
      operation: "set",
      value: "0",
    },
    {
      userId: userTwo,
      statKey: statKeys.currentWinStreak,
      operation: "set",
      value: "0",
    },
    {
      userId: userTwo,
      statKey: statKeys.currentLossStreak,
      operation: "set",
      value: "0",
    },
  ]);
});

test("gates daily streak operations on first daily activity insertion", async () => {
  const { calls, query } = createQueryRecorder((sql) => {
    if (/FROM auth\.user_stats/i.test(sql) && /stat_key = ANY/i.test(sql)) {
      return {
        rows: [
          {
            user_id: userOne,
            stat_key: statKeys.currentDailyPlayStreak,
            value: "5",
          },
        ],
      };
    }
    if (/FROM auth\.user_stat_daily_activity/i.test(sql)) {
      return {
        rows: [
          {
            user_id: userOne,
            play_date: "2026-06-28",
            previous_play_date: "2026-06-27",
          },
        ],
      };
    }
    if (/INSERT INTO auth\.user_stat_events/i.test(sql)) {
      return { rows: [{ user_id: userOne }] };
    }
    if (/INSERT INTO auth\.user_title_unlocks/i.test(sql)) {
      return { rows: [] };
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  });
  const sink = createPostgresUserStatsSink(query);

  await sink.recordCompletedMatchStats({
    matchId: "match-3" as MatchId,
    operations: [
      {
        userId: userOne,
        statKey: statKeys.dailyMatchesCompleted("2026-06-28"),
        operation: "increment",
        value: 1,
      },
    ],
  });

  const batchCall = statBatchCall(calls);
  assert.match(batchCall.sql, /inserted_daily_activity AS/i);
  assert.match(
    batchCall.sql,
    /ON CONFLICT\s*\(\s*user_id\s*,\s*play_date\s*\)\s*DO NOTHING/i,
  );
  assert.match(batchCall.sql, /requires_daily_activity IS NOT TRUE/i);
  assert.deepEqual(
    batchCall.params?.[3],
    JSON.stringify([{ userId: userOne, playDate: "2026-06-28" }]),
  );
  assert.deepEqual(jsonPayload(batchCall), [
    {
      userId: userOne,
      statKey: statKeys.dailyMatchesCompleted("2026-06-28"),
      operation: "increment",
      value: "1",
    },
    {
      userId: userOne,
      statKey: statKeys.currentDailyPlayStreak,
      operation: "set",
      value: "6",
      requiresDailyActivity: true,
    },
    {
      userId: userOne,
      statKey: statKeys.bestDailyPlayStreak,
      operation: "max",
      value: "6",
      requiresDailyActivity: true,
    },
  ]);
});
