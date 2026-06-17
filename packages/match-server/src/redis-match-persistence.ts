import type { MatchId } from "@optcg/types";

import type {
  MatchPersistence,
  MatchPersistenceSnapshot,
  RecoveryLock,
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
    locks: `${prefix}:locks`,
    freeze: `${prefix}:freeze`,
  };
};

const serialize = (value: unknown): string => JSON.stringify(value);

const parseJson = (value: string): unknown => JSON.parse(value) as unknown;

const pushRecords = async (
  redis: RedisLike,
  key: string,
  records: readonly StoredSessionRecord[],
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

export const createRedisMatchPersistence = (
  redis: RedisLike,
): MatchPersistence => ({
  async saveSnapshot(input) {
    const matchKeys = keys(input.metadata.matchId);
    await redis.set(matchKeys.meta, serialize(input.metadata));
    await redis.set(matchKeys.state, serialize(input.state));
    await redis.set(matchKeys.manifest, serialize(input.manifest));
    if (input.recoveryContext === undefined) {
      await redis.del(matchKeys.context);
    } else {
      await redis.set(matchKeys.context, serialize(input.recoveryContext));
    }
    await redis.del(matchKeys.actions);
    await redis.del(matchKeys.decisions);
    await pushRecords(redis, matchKeys.actions, input.actions);
    await pushRecords(redis, matchKeys.decisions, input.decisions);
  },
  async appendAction({ matchId, record }) {
    await redis.rPush(keys(matchId).actions, serialize(record));
  },
  async appendDecision({ matchId, record }) {
    await redis.rPush(keys(matchId).decisions, serialize(record));
  },
  async loadSnapshot(matchId) {
    const matchKeys = keys(matchId);
    const [metadata, state, manifest, context, actions, decisions] =
      await Promise.all([
        redis.get(matchKeys.meta),
        redis.get(matchKeys.state),
        redis.get(matchKeys.manifest),
        redis.get(matchKeys.context),
        redis.lRange(matchKeys.actions, 0, -1),
        redis.lRange(matchKeys.decisions, 0, -1),
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
      actions: actions.map(
        (record) => parseJson(record) as StoredSessionRecord,
      ),
      decisions: decisions.map(
        (record) => parseJson(record) as StoredSessionRecord,
      ),
    };
  },
  async listActiveMatchIds() {
    const ids = (await scanAll(redis, "match:*:meta"))
      .map(matchIdFromMetaKey)
      .filter((matchId): matchId is MatchId => matchId !== undefined);
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
  async releaseRecoveryLock({ matchId, ownerInstanceId }) {
    const lockKey = keys(matchId).locks;
    const existing = await redis.get(lockKey);
    if (existing === null) {
      return;
    }
    if (
      (parseJson(existing) as RecoveryLock).ownerInstanceId === ownerInstanceId
    ) {
      await redis.del(lockKey);
    }
  },
  async freezeMatch(input) {
    await redis.set(keys(input.matchId).freeze, serialize(input));
  },
});
