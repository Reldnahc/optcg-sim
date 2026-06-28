import type { UserStatOperation } from "./match-stat-extractor.js";
import type {
  CompletedMatchStatSink,
  CompletedMatchStatSinkInput,
} from "./stat-sink.js";
import { statKeys } from "./user-stat-keys.js";

export interface PostgresUserStatsQueryResult {
  readonly rows?: readonly Record<string, unknown>[];
}

export type PostgresUserStatsQuery = (
  sql: string,
  params?: readonly unknown[],
) => Promise<PostgresUserStatsQueryResult>;

type UserStatOperationKind = UserStatOperation["operation"];

interface AggregatedOperation {
  readonly userId: string;
  readonly statKey: string;
  readonly operation: UserStatOperationKind;
  value: bigint;
  requiresDailyActivity?: true;
}

interface StatOperationInput {
  readonly userId: string;
  readonly statKey: string;
  readonly operation: UserStatOperationKind;
  readonly value: bigint | number | string;
  readonly requiresDailyActivity?: true;
}

interface DailyCandidate {
  readonly userId: string;
  readonly playDate: string;
}

const sourceType = "completed_match";

const statKeyPattern = /^[A-Za-z0-9][A-Za-z0-9_:-]{0,160}$/u;
const sourceIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,200}$/u;
const operationKinds = new Set<UserStatOperationKind>([
  "increment",
  "set",
  "max",
]);
const dailyCompletedPattern = /^daily_matches_completed:(\d{4}-\d{2}-\d{2})$/u;

const applyStatsSql = `
  WITH operation_payload AS (
    SELECT
      $1::text AS source_type,
      $2::text AS source_id,
      payload."userId"::uuid AS user_id,
      payload."statKey" AS stat_key,
      payload.operation AS operation,
      payload.value::bigint AS value,
      COALESCE(payload."requiresDailyActivity", false) AS requires_daily_activity
    FROM jsonb_to_recordset($3::jsonb) AS payload(
      "userId" text,
      "statKey" text,
      operation text,
      value text,
      "requiresDailyActivity" boolean
    )
  ),
  daily_candidates AS (
    SELECT
      payload."userId"::uuid AS user_id,
      payload."playDate"::date AS play_date
    FROM jsonb_to_recordset($4::jsonb) AS payload(
      "userId" text,
      "playDate" text
    )
  ),
  inserted_daily_activity AS (
    INSERT INTO auth.user_stat_daily_activity (
      user_id,
      play_date,
      first_source_type,
      first_source_id
    )
    SELECT user_id, play_date, $1::text, $2::text
    FROM daily_candidates
    ON CONFLICT (user_id, play_date) DO NOTHING
    RETURNING user_id, play_date
  ),
  operation_batch AS (
    SELECT
      source_type,
      source_id,
      user_id,
      stat_key,
      operation,
      value
    FROM operation_payload
    WHERE requires_daily_activity IS NOT TRUE
      OR EXISTS (
        SELECT 1
        FROM inserted_daily_activity daily
        WHERE daily.user_id = operation_payload.user_id
      )
  ),
  inserted AS (
    INSERT INTO auth.user_stat_events (
      source_type,
      source_id,
      user_id,
      stat_key,
      operation,
      value
    )
    SELECT source_type, source_id, user_id, stat_key, operation, value
    FROM operation_batch
    ON CONFLICT (source_type, source_id, user_id, stat_key, operation) DO NOTHING
    RETURNING user_id, stat_key, operation, value
  ),
  incremented AS (
    INSERT INTO auth.user_stats (user_id, stat_key, value)
    SELECT user_id, stat_key, value
    FROM inserted
    WHERE operation = 'increment'
    ON CONFLICT (user_id, stat_key) DO UPDATE SET
      value = auth.user_stats.value + EXCLUDED.value,
      updated_at = now()
    RETURNING user_id
  ),
  set_values AS (
    INSERT INTO auth.user_stats (user_id, stat_key, value)
    SELECT user_id, stat_key, value
    FROM inserted
    WHERE operation = 'set'
    ON CONFLICT (user_id, stat_key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = now()
    RETURNING user_id
  ),
  max_values AS (
    INSERT INTO auth.user_stats (user_id, stat_key, value)
    SELECT user_id, stat_key, value
    FROM inserted
    WHERE operation = 'max'
    ON CONFLICT (user_id, stat_key) DO UPDATE SET
      value = GREATEST(auth.user_stats.value, EXCLUDED.value),
      updated_at = now()
    RETURNING user_id
  )
  SELECT DISTINCT user_id::text AS user_id
  FROM inserted
  ORDER BY user_id ASC
`;

const selectCurrentStatsSql = `
  SELECT user_id::text AS user_id, stat_key, value::text AS value
  FROM auth.user_stats
  WHERE user_id = ANY($1::uuid[])
    AND stat_key = ANY($2::text[])
`;

const selectPreviousDailyActivitySql = `
  WITH daily_candidates AS (
    SELECT
      payload."userId"::uuid AS user_id,
      payload."playDate"::date AS play_date
    FROM jsonb_to_recordset($1::jsonb) AS payload(
      "userId" text,
      "playDate" text
    )
  )
  SELECT
    daily_candidates.user_id::text AS user_id,
    daily_candidates.play_date::text AS play_date,
    previous.play_date::text AS previous_play_date
  FROM daily_candidates
  LEFT JOIN LATERAL (
    SELECT play_date
    FROM auth.user_stat_daily_activity
    WHERE user_id = daily_candidates.user_id
      AND play_date < daily_candidates.play_date
    ORDER BY play_date DESC
    LIMIT 1
  ) previous ON true
`;

const evaluateAutomaticTitleUnlocksSql = `
  WITH eligible_titles AS (
    SELECT pt.key AS title_key
    FROM auth.profile_titles pt
    WHERE pt.active IS TRUE
      AND pt.unlock_mode = 'automatic'
      AND NOT EXISTS (
        SELECT 1 FROM auth.user_title_unlocks existing
        WHERE existing.user_id = $1
          AND existing.title_key = pt.key
          AND existing.revoked_at IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM auth.profile_title_requirements req
        WHERE req.title_key = pt.key
      )
      AND NOT EXISTS (
        SELECT 1
        FROM auth.profile_title_requirements req
        LEFT JOIN auth.user_stats stat
          ON stat.user_id = $1
         AND stat.stat_key = req.stat_key
        WHERE req.title_key = pt.key
          AND req.operator = 'gte'
          AND COALESCE(stat.value, 0) < req.threshold
      )
  )
  INSERT INTO auth.user_title_unlocks (user_id, title_key, granted_by_admin_email, note)
  SELECT $1, title_key, 'system@poneglyph.one', 'Automatic stat unlock'
  FROM eligible_titles
  ON CONFLICT DO NOTHING
`;

const mapKey = (userId: string, statKey: string): string =>
  `${userId}\u0000${statKey}`;

const operationKey = (
  operation: Pick<AggregatedOperation, "userId" | "statKey" | "operation">,
): string =>
  `${operation.userId}\u0000${operation.statKey}\u0000${operation.operation}`;

const validateSourceId = (sourceId: string): void => {
  if (!sourceIdPattern.test(sourceId)) {
    throw new Error("Invalid completed match stat source id.");
  }
};

const validateOperation = (
  operation: Pick<StatOperationInput, "statKey" | "operation">,
): void => {
  if (!statKeyPattern.test(operation.statKey)) {
    throw new Error("Invalid user stat key.");
  }
  if (!operationKinds.has(operation.operation)) {
    throw new Error("Invalid user stat operation.");
  }
};

const toNonNegativeBigint = (value: unknown): bigint => {
  let parsed: bigint;
  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("User stat value must be a non-negative integer.");
    }
    parsed = BigInt(value);
  } else if (typeof value === "string" && /^[0-9]+$/u.test(value)) {
    parsed = BigInt(value);
  } else {
    throw new Error("User stat value must be a non-negative integer.");
  }
  if (parsed < 0n) {
    throw new Error("User stat value must be a non-negative integer.");
  }
  return parsed;
};

const aggregateOperations = (
  operations: readonly StatOperationInput[],
): AggregatedOperation[] => {
  const aggregated = new Map<string, AggregatedOperation>();
  const operationKindsByStat = new Map<string, UserStatOperationKind>();

  for (const operation of operations) {
    validateOperation(operation);
    const statOperationKey = mapKey(operation.userId, operation.statKey);
    const existingOperationKind = operationKindsByStat.get(statOperationKey);
    if (
      existingOperationKind !== undefined &&
      existingOperationKind !== operation.operation
    ) {
      throw new Error(
        "User stat batch cannot mix operation kinds for the same stat.",
      );
    }
    operationKindsByStat.set(statOperationKey, operation.operation);

    const value = toNonNegativeBigint(operation.value);
    const key = operationKey(operation);
    const existing = aggregated.get(key);
    if (existing === undefined) {
      aggregated.set(key, {
        userId: operation.userId,
        statKey: operation.statKey,
        operation: operation.operation,
        value,
        ...("requiresDailyActivity" in operation &&
        operation.requiresDailyActivity === true
          ? { requiresDailyActivity: true as const }
          : {}),
      });
      continue;
    }
    if (operation.operation === "increment") {
      existing.value += value;
    } else if (operation.operation === "max") {
      existing.value = existing.value > value ? existing.value : value;
    } else {
      existing.value = value;
    }
    if (
      "requiresDailyActivity" in operation &&
      operation.requiresDailyActivity === true
    ) {
      existing.requiresDailyActivity = true;
    }
  }

  return [...aggregated.values()];
};

const hasPositiveValue = (operation: UserStatOperation): boolean =>
  toNonNegativeBigint(operation.value) > 0n;

const deriveOutcomes = (
  operations: readonly UserStatOperation[],
): ReadonlyMap<string, "win" | "loss" | "draw"> => {
  const outcomes = new Map<string, "win" | "loss" | "draw">();
  for (const operation of operations) {
    if (operation.operation !== "increment" || !hasPositiveValue(operation)) {
      continue;
    }
    const outcome =
      operation.statKey === statKeys.matchesWon
        ? "win"
        : operation.statKey === statKeys.matchesLost
          ? "loss"
          : operation.statKey === statKeys.matchesDrawn
            ? "draw"
            : undefined;
    if (outcome === undefined) {
      continue;
    }
    const existing = outcomes.get(operation.userId);
    if (existing !== undefined && existing !== outcome) {
      throw new Error(
        "User stat batch cannot contain multiple match outcomes for the same user.",
      );
    }
    outcomes.set(operation.userId, outcome);
  }
  return outcomes;
};

const validDateKey = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const deriveDailyCandidates = (
  operations: readonly UserStatOperation[],
): DailyCandidate[] => {
  const seen = new Set<string>();
  const candidates: DailyCandidate[] = [];
  for (const operation of operations) {
    if (operation.operation !== "increment" || !hasPositiveValue(operation)) {
      continue;
    }
    const match = dailyCompletedPattern.exec(operation.statKey);
    const playDate = match?.[1];
    if (playDate === undefined || !validDateKey(playDate)) {
      continue;
    }
    const key = `${operation.userId}\u0000${playDate}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    candidates.push({ userId: operation.userId, playDate });
  }
  return candidates.sort((left, right) =>
    left.userId === right.userId
      ? left.playDate.localeCompare(right.playDate)
      : left.userId.localeCompare(right.userId),
  );
};

const rowString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const readCurrentStats = async (
  runQuery: PostgresUserStatsQuery,
  userIds: readonly string[],
  statKeysToRead: readonly string[],
): Promise<ReadonlyMap<string, bigint>> => {
  if (userIds.length === 0 || statKeysToRead.length === 0) {
    return new Map();
  }
  const result = await runQuery(selectCurrentStatsSql, [
    userIds,
    statKeysToRead,
  ]);
  const values = new Map<string, bigint>();
  for (const row of result.rows ?? []) {
    const userId = rowString(row["user_id"]);
    const statKey = rowString(row["stat_key"]);
    if (userId !== undefined && statKey !== undefined) {
      values.set(
        mapKey(userId, statKey),
        toNonNegativeBigint(row["value"] ?? 0),
      );
    }
  }
  return values;
};

const readPreviousActivity = async (
  runQuery: PostgresUserStatsQuery,
  dailyCandidates: readonly DailyCandidate[],
): Promise<ReadonlyMap<string, string>> => {
  if (dailyCandidates.length === 0) {
    return new Map();
  }
  const result = await runQuery(selectPreviousDailyActivitySql, [
    JSON.stringify(dailyCandidates),
  ]);
  const previousActivity = new Map<string, string>();
  for (const row of result.rows ?? []) {
    const userId = rowString(row["user_id"]);
    const playDate = rowString(row["play_date"]);
    const previousPlayDate = rowString(row["previous_play_date"]);
    if (
      userId !== undefined &&
      playDate !== undefined &&
      previousPlayDate !== undefined
    ) {
      previousActivity.set(`${userId}\u0000${playDate}`, previousPlayDate);
    }
  }
  return previousActivity;
};

const getStatValue = (
  stats: ReadonlyMap<string, bigint>,
  userId: string,
  statKey: string,
): bigint => stats.get(mapKey(userId, statKey)) ?? 0n;

const previousUtcDateKey = (playDate: string): string => {
  const [yearText, monthText, dayText] = playDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  const monthKey = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dayKey = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${monthKey}-${dayKey}`;
};

const deriveOutcomeStreakOperations = (
  outcomes: ReadonlyMap<string, "win" | "loss" | "draw">,
  currentStats: ReadonlyMap<string, bigint>,
): AggregatedOperation[] => {
  const operations: AggregatedOperation[] = [];
  for (const [userId, outcome] of [...outcomes.entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  )) {
    if (outcome === "win") {
      const next =
        getStatValue(currentStats, userId, statKeys.currentWinStreak) + 1n;
      operations.push(
        {
          userId,
          statKey: statKeys.currentWinStreak,
          operation: "set",
          value: next,
        },
        {
          userId,
          statKey: statKeys.bestWinStreak,
          operation: "max",
          value: next,
        },
        {
          userId,
          statKey: statKeys.currentLossStreak,
          operation: "set",
          value: 0n,
        },
      );
      continue;
    }
    if (outcome === "loss") {
      const next =
        getStatValue(currentStats, userId, statKeys.currentLossStreak) + 1n;
      operations.push(
        {
          userId,
          statKey: statKeys.currentLossStreak,
          operation: "set",
          value: next,
        },
        {
          userId,
          statKey: statKeys.bestLossStreak,
          operation: "max",
          value: next,
        },
        {
          userId,
          statKey: statKeys.currentWinStreak,
          operation: "set",
          value: 0n,
        },
      );
      continue;
    }
    operations.push(
      {
        userId,
        statKey: statKeys.currentWinStreak,
        operation: "set",
        value: 0n,
      },
      {
        userId,
        statKey: statKeys.currentLossStreak,
        operation: "set",
        value: 0n,
      },
    );
  }
  return operations;
};

const deriveDailyStreakOperations = (
  dailyCandidates: readonly DailyCandidate[],
  currentStats: ReadonlyMap<string, bigint>,
  previousActivity: ReadonlyMap<string, string>,
): AggregatedOperation[] =>
  dailyCandidates.flatMap((candidate) => {
    const previousPlayDate = previousActivity.get(
      `${candidate.userId}\u0000${candidate.playDate}`,
    );
    const next =
      previousPlayDate === previousUtcDateKey(candidate.playDate)
        ? getStatValue(
            currentStats,
            candidate.userId,
            statKeys.currentDailyPlayStreak,
          ) + 1n
        : 1n;
    return [
      {
        userId: candidate.userId,
        statKey: statKeys.currentDailyPlayStreak,
        operation: "set" as const,
        value: next,
        requiresDailyActivity: true as const,
      },
      {
        userId: candidate.userId,
        statKey: statKeys.bestDailyPlayStreak,
        operation: "max" as const,
        value: next,
        requiresDailyActivity: true as const,
      },
    ];
  });

const operationPayload = (operations: readonly AggregatedOperation[]): string =>
  JSON.stringify(
    operations.map((operation) => ({
      userId: operation.userId,
      statKey: operation.statKey,
      operation: operation.operation,
      value: operation.value.toString(),
      ...(operation.requiresDailyActivity === true
        ? { requiresDailyActivity: true }
        : {}),
    })),
  );

const affectedUserIds = (
  rows: readonly Record<string, unknown>[] | undefined,
): readonly string[] => {
  const userIds = new Set<string>();
  for (const row of rows ?? []) {
    const userId = rowString(row["user_id"]);
    if (userId !== undefined) {
      userIds.add(userId);
    }
  }
  return [...userIds].sort();
};

const recordCompletedMatchStats = async (
  runQuery: PostgresUserStatsQuery,
  input: CompletedMatchStatSinkInput,
): Promise<void> => {
  const sourceId = String(input.matchId);
  validateSourceId(sourceId);
  const baseOperations = aggregateOperations(input.operations);
  if (baseOperations.length === 0) {
    return;
  }

  const outcomes = deriveOutcomes(input.operations);
  const dailyCandidates = deriveDailyCandidates(input.operations);
  const usersWithDerivedStats = new Set([
    ...outcomes.keys(),
    ...dailyCandidates.map((candidate) => candidate.userId),
  ]);
  const currentStats = await readCurrentStats(
    runQuery,
    [...usersWithDerivedStats].sort(),
    [
      statKeys.currentWinStreak,
      statKeys.currentLossStreak,
      statKeys.currentDailyPlayStreak,
    ],
  );
  const previousActivity = await readPreviousActivity(
    runQuery,
    dailyCandidates,
  );
  const operations = aggregateOperations([
    ...baseOperations,
    ...deriveOutcomeStreakOperations(outcomes, currentStats),
    ...deriveDailyStreakOperations(
      dailyCandidates,
      currentStats,
      previousActivity,
    ),
  ]);

  const result = await runQuery(applyStatsSql, [
    sourceType,
    sourceId,
    operationPayload(operations),
    JSON.stringify(dailyCandidates),
  ]);

  for (const userId of affectedUserIds(result.rows)) {
    await runQuery(evaluateAutomaticTitleUnlocksSql, [userId]);
  }
};

export const createPostgresUserStatsSink = (
  runQuery: PostgresUserStatsQuery,
): CompletedMatchStatSink => ({
  recordCompletedMatchStats: (input) =>
    recordCompletedMatchStats(runQuery, input),
});
