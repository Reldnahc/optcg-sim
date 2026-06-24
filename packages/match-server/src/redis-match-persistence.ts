import { randomUUID } from "node:crypto";

import type { MatchId } from "@optcg/types";

import type {
  MatchPersistence,
  MatchPersistenceSnapshot,
  RecoveryLock,
  StoredDeterministicCheckpointRecord,
  StoredDeterministicSessionRecord,
  StoredSessionRecord,
} from "./session-types.js";

export interface RedisSetOptions {
  readonly nx?: boolean;
  readonly px?: number;
}

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: RedisSetOptions,
  ): Promise<"OK" | null>;
  del(key: string): Promise<number>;
  rPush(key: string, ...values: string[]): Promise<number>;
  lRange(key: string, start: number, stop: number): Promise<string[]>;
  compareAndDelete(key: string, expectedValue: string): Promise<boolean>;
  scan(
    cursor: string,
    options: { readonly match: string; readonly count: number },
  ): Promise<[string, string[]]>;
}

const keys = (matchId: MatchId) => {
  const prefix = `match:${String(matchId)}`;
  return {
    state: `${prefix}:state`,
    meta: `${prefix}:meta`,
    context: `${prefix}:context`,
    manifest: `${prefix}:manifest`,
    actions: `${prefix}:actions`,
    decisions: `${prefix}:decisions`,
    deterministicEntriesSinceSnapshot: `${prefix}:deterministic-entries`,
    deterministicCheckpoints: `${prefix}:deterministic-checkpoints`,
    deterministicLogVersion: `${prefix}:deterministic-log-version`,
    current: `${prefix}:current`,
    snapshotsPrefix: `${prefix}:snapshots:`,
    locks: `${prefix}:locks`,
    freeze: `${prefix}:freeze`,
    snapshot(generation: string) {
      const snapshotPrefix = `${prefix}:snapshots:${generation}`;
      return {
        metadata: `${snapshotPrefix}:metadata`,
        state: `${snapshotPrefix}:state`,
        context: `${snapshotPrefix}:context`,
        manifest: `${snapshotPrefix}:manifest`,
        actions: `${snapshotPrefix}:actions`,
        decisions: `${snapshotPrefix}:decisions`,
        deterministicEntriesSinceSnapshot: `${snapshotPrefix}:deterministic-entries`,
        deterministicCheckpoints: `${snapshotPrefix}:deterministic-checkpoints`,
        deterministicLogVersion: `${snapshotPrefix}:deterministic-log-version`,
      };
    },
  };
};

const serialize = (value: unknown): string => JSON.stringify(value);

const parseJson = (value: string): unknown => JSON.parse(value) as unknown;

const pushRecords = async <T>(
  redis: RedisLike,
  key: string,
  records: readonly T[],
): Promise<void> => {
  if (records.length === 0) {
    return;
  }
  await redis.rPush(key, ...records.map(serialize));
};

const matchIdFromMetaKey = (key: string): MatchId | undefined => {
  const match = /^match:(.+):meta$/u.exec(key);
  return match?.[1] as MatchId | undefined;
};

const matchIdFromCurrentKey = (key: string): MatchId | undefined => {
  const match = /^match:(.+):current$/u.exec(key);
  return match?.[1] as MatchId | undefined;
};

const scanAll = async (
  redis: RedisLike,
  pattern: string,
): Promise<string[]> => {
  const keysFound: string[] = [];
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, {
      match: pattern,
      count: 100,
    });
    keysFound.push(...keys);
    cursor = nextCursor;
  } while (cursor !== "0");
  return keysFound;
};

const snapshotGeneration = (snapshot: MatchPersistenceSnapshot): string =>
  `${String(snapshot.state.seq)}:${randomUUID()}`;

const cleanupOldSnapshotGenerations = async (
  redis: RedisLike,
  matchKeys: ReturnType<typeof keys>,
  currentGeneration: string,
): Promise<void> => {
  const currentPrefix = `${matchKeys.snapshotsPrefix}${currentGeneration}:`;
  const staleKeys = (
    await scanAll(redis, `${matchKeys.snapshotsPrefix}*`)
  ).filter(
    (key) =>
      key.startsWith(matchKeys.snapshotsPrefix) &&
      !key.startsWith(currentPrefix),
  );
  for (const key of staleKeys) {
    await redis.del(key);
  }
};

const legacyActiveMatchIds = async (redis: RedisLike): Promise<MatchId[]> => {
  const ids: MatchId[] = [];
  for (const matchId of (await scanAll(redis, "match:*:meta"))
    .map(matchIdFromMetaKey)
    .filter((candidate): candidate is MatchId => candidate !== undefined)) {
    const matchKeys = keys(matchId);
    const [state, manifest] = await Promise.all([
      redis.get(matchKeys.state),
      redis.get(matchKeys.manifest),
    ]);
    if (state !== null && manifest !== null) {
      ids.push(matchId);
    }
  }
  return ids;
};

const loadSnapshotFromKeys = async (
  redis: RedisLike,
  snapshotKeys: {
    readonly metadata: string;
    readonly state: string;
    readonly manifest: string;
    readonly context: string;
    readonly actions: string;
    readonly decisions: string;
    readonly deterministicEntriesSinceSnapshot: string;
    readonly deterministicCheckpoints: string;
    readonly deterministicLogVersion: string;
  },
): Promise<MatchPersistenceSnapshot | undefined> => {
  const [
    metadata,
    state,
    manifest,
    context,
    actions,
    decisions,
    deterministicLogVersion,
    deterministicEntriesSinceSnapshot,
    deterministicCheckpoints,
  ] = await Promise.all([
    redis.get(snapshotKeys.metadata),
    redis.get(snapshotKeys.state),
    redis.get(snapshotKeys.manifest),
    redis.get(snapshotKeys.context),
    redis.lRange(snapshotKeys.actions, 0, -1),
    redis.lRange(snapshotKeys.decisions, 0, -1),
    redis.get(snapshotKeys.deterministicLogVersion),
    redis.lRange(snapshotKeys.deterministicEntriesSinceSnapshot, 0, -1),
    redis.lRange(snapshotKeys.deterministicCheckpoints, 0, -1),
  ]);
  if (metadata === null || state === null || manifest === null) {
    return undefined;
  }
  const recoveryContext =
    context === null
      ? undefined
      : (parseJson(context) as NonNullable<
          MatchPersistenceSnapshot["recoveryContext"]
        >);
  return {
    metadata: parseJson(metadata) as MatchPersistenceSnapshot["metadata"],
    state: parseJson(state) as MatchPersistenceSnapshot["state"],
    manifest: parseJson(manifest) as MatchPersistenceSnapshot["manifest"],
    ...(recoveryContext === undefined ? {} : { recoveryContext }),
    actions: actions.map((record) => parseJson(record) as StoredSessionRecord),
    decisions: decisions.map(
      (record) => parseJson(record) as StoredSessionRecord,
    ),
    ...(deterministicLogVersion !== "deterministic-entry-v1"
      ? {}
      : {
          deterministicLogVersion,
          deterministicEntriesSinceSnapshot:
            deterministicEntriesSinceSnapshot.map(
              (record) =>
                parseJson(record) as StoredDeterministicSessionRecord,
            ),
          deterministicCheckpoints: deterministicCheckpoints.map(
            (record) =>
              parseJson(record) as StoredDeterministicCheckpointRecord,
          ),
        }),
  };
};

export const createRedisMatchPersistence = (
  redis: RedisLike,
): MatchPersistence => ({
  async saveSnapshot(input) {
    const matchKeys = keys(input.metadata.matchId);
    const generation = snapshotGeneration(input);
    const snapshotKeys = matchKeys.snapshot(generation);
    await redis.set(snapshotKeys.metadata, serialize(input.metadata));
    await redis.set(snapshotKeys.state, serialize(input.state));
    await redis.set(snapshotKeys.manifest, serialize(input.manifest));
    if (input.recoveryContext === undefined) {
      await redis.del(snapshotKeys.context);
    } else {
      await redis.set(snapshotKeys.context, serialize(input.recoveryContext));
    }
    await redis.del(snapshotKeys.actions);
    await redis.del(snapshotKeys.decisions);
    await redis.del(snapshotKeys.deterministicEntriesSinceSnapshot);
    await redis.del(snapshotKeys.deterministicCheckpoints);
    await pushRecords(redis, snapshotKeys.actions, input.actions);
    await pushRecords(redis, snapshotKeys.decisions, input.decisions);
    if (input.deterministicLogVersion === undefined) {
      await redis.del(snapshotKeys.deterministicLogVersion);
    } else {
      await redis.set(
        snapshotKeys.deterministicLogVersion,
        input.deterministicLogVersion,
      );
    }
    await pushRecords(
      redis,
      snapshotKeys.deterministicEntriesSinceSnapshot,
      input.deterministicEntriesSinceSnapshot ?? [],
    );
    await pushRecords(
      redis,
      snapshotKeys.deterministicCheckpoints,
      input.deterministicCheckpoints ?? [],
    );
    await redis.set(matchKeys.current, generation);
    await cleanupOldSnapshotGenerations(redis, matchKeys, generation).catch(
      () => undefined,
    );
  },
  async appendDeterministicEntry({ matchId, record }) {
    const matchKeys = keys(matchId);
    const generation = await redis.get(matchKeys.current);
    await redis.rPush(
      generation === null
        ? matchKeys.deterministicEntriesSinceSnapshot
        : matchKeys.snapshot(generation).deterministicEntriesSinceSnapshot,
      serialize(record),
    );
  },
  async appendAction({ matchId, record }) {
    const matchKeys = keys(matchId);
    const generation = await redis.get(matchKeys.current);
    await redis.rPush(
      generation === null
        ? matchKeys.actions
        : matchKeys.snapshot(generation).actions,
      serialize(record),
    );
  },
  async appendDecision({ matchId, record }) {
    const matchKeys = keys(matchId);
    const generation = await redis.get(matchKeys.current);
    await redis.rPush(
      generation === null
        ? matchKeys.decisions
        : matchKeys.snapshot(generation).decisions,
      serialize(record),
    );
  },
  async loadSnapshot(matchId) {
    const matchKeys = keys(matchId);
    const generation = await redis.get(matchKeys.current);
    return loadSnapshotFromKeys(
      redis,
      generation === null
        ? {
            metadata: matchKeys.meta,
            state: matchKeys.state,
            manifest: matchKeys.manifest,
            context: matchKeys.context,
            actions: matchKeys.actions,
            decisions: matchKeys.decisions,
            deterministicEntriesSinceSnapshot:
              matchKeys.deterministicEntriesSinceSnapshot,
            deterministicCheckpoints: matchKeys.deterministicCheckpoints,
            deterministicLogVersion: matchKeys.deterministicLogVersion,
          }
        : matchKeys.snapshot(generation),
    );
  },
  async listActiveMatchIds() {
    const ids = [
      ...(await scanAll(redis, "match:*:current"))
        .map(matchIdFromCurrentKey)
        .filter((matchId): matchId is MatchId => matchId !== undefined),
      ...(await legacyActiveMatchIds(redis)),
    ];
    return [...new Set(ids)];
  },
  async tryAcquireRecoveryLock({ matchId, ownerInstanceId, now, ttlMs }) {
    const acquiredAtMs = Date.parse(now);
    const lock: RecoveryLock = {
      matchId,
      ownerInstanceId,
      acquiredAt: new Date(acquiredAtMs).toISOString(),
      expiresAt: new Date(acquiredAtMs + ttlMs).toISOString(),
    };
    const lockKey = keys(matchId).locks;
    const acquired = await redis.set(lockKey, serialize(lock), {
      nx: true,
      px: ttlMs,
    });
    if (acquired === "OK") {
      return lock;
    }
    const existing = await redis.get(lockKey);
    if (existing === null) {
      return undefined;
    }
    const existingLock = parseJson(existing) as RecoveryLock;
    if (existingLock.ownerInstanceId !== ownerInstanceId) {
      return undefined;
    }
    await redis.set(lockKey, serialize(lock), { px: ttlMs });
    return lock;
  },
  async releaseRecoveryLock({ lock }) {
    await redis.compareAndDelete(keys(lock.matchId).locks, serialize(lock));
  },
  async freezeMatch(input) {
    await redis.set(keys(input.matchId).freeze, serialize(input));
  },
});
