import { describe, expect, test } from "vitest";
import type {
  DeterministicCheckpoint,
  MatchId,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import { requestHash } from "./action-envelope.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import { createLocalDevMatch } from "./local-match.js";
import {
  createRedisMatchPersistence,
  type RedisLike,
  type RedisSetOptions,
} from "./redis-match-persistence.js";
import type {
  ClientActionEnvelope,
  MatchSessionMetadata,
  SessionActionRequest,
  StoredDeterministicCheckpointRecord,
  StoredDeterministicSessionRecord,
  StoredSessionRecord,
} from "./session-types.js";

const matchId = "redis-match" as MatchId;
const p1 = "p1" as PlayerId;

const redisGlobPattern = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, "\\$&"))
      .join(".*")}$`,
    "u",
  );

class FakeRedis implements RedisLike {
  public readonly strings = new Map<string, string>();
  public readonly lists = new Map<string, string[]>();
  public readonly scanPatterns: string[] = [];
  public failSetWhen: ((key: string) => boolean) | undefined;
  public afterGet: ((key: string, value: string | null) => void) | undefined;

  public get(key: string): Promise<string | null> {
    const value = this.strings.get(key) ?? null;
    this.afterGet?.(key, value);
    return Promise.resolve(value);
  }

  public set(
    key: string,
    value: string,
    options?: RedisSetOptions,
  ): Promise<"OK" | null> {
    if (this.failSetWhen?.(key) === true) {
      return Promise.reject(new Error(`set failed for ${key}`));
    }
    if (options?.nx === true && this.strings.has(key)) {
      return Promise.resolve(null);
    }
    this.strings.set(key, value);
    return Promise.resolve("OK");
  }

  public del(key: string): Promise<number> {
    const deleted =
      (this.strings.delete(key) ? 1 : 0) + (this.lists.delete(key) ? 1 : 0);
    return Promise.resolve(deleted);
  }

  public compareAndDelete(
    key: string,
    expectedValue: string,
  ): Promise<boolean> {
    this.afterGet?.(key, this.strings.get(key) ?? null);
    if (this.strings.get(key) !== expectedValue) {
      return Promise.resolve(false);
    }
    this.strings.delete(key);
    return Promise.resolve(true);
  }

  public rPush(key: string, ...values: string[]): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.push(...values);
    this.lists.set(key, list);
    return Promise.resolve(list.length);
  }

  public lRange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    return Promise.resolve(list.slice(start, stop < 0 ? undefined : stop + 1));
  }

  public scan(
    _cursor: string,
    options: { readonly match: string; readonly count: number },
  ): Promise<[string, string[]]> {
    this.scanPatterns.push(options.match);
    const pattern = redisGlobPattern(options.match);
    const keys = [...this.strings.keys(), ...this.lists.keys()].filter((key) =>
      pattern.test(key),
    );
    return Promise.resolve(["0", keys]);
  }
}

const metadata = (): MatchSessionMetadata => ({
  matchId,
  gameType: "dev",
  formatId: "dev",
  createdAt: "2026-05-30T00:00:00.000Z",
  playerIds: ["p1" as PlayerId, "p2" as PlayerId],
  creationSource: { type: "dev" },
  disconnectPolicyMode: "dev-none",
  rollbackPolicyMode: "mutual-consent",
  spectatorPolicyMode: "live-filtered",
  firstPlayerChoice: {
    source: "game-one-random-chooser",
    chooserPlayerId: p1,
  },
});

const record = (clientActionId: string): StoredSessionRecord => {
  const request: SessionActionRequest = {
    type: "submitAction",
    playerId: p1,
    actionIndex: 0,
    expectedStateSeq: 1,
  };
  const envelope: ClientActionEnvelope = {
    protocolVersion: "dev",
    matchId,
    playerId: p1,
    clientActionId,
    expectedStateSeq: 1,
    requestHash: requestHash(request),
    request,
  };
  return {
    envelope,
    result: {
      type: "actionResult",
      matchId,
      clientActionId,
      accepted: true,
      stateSeq: 2,
      actionSeq: 1,
      errors: [],
    },
    recordedAt: "2026-05-30T00:00:01.000Z",
  };
};

const deterministicRecord = (
  entrySeq = 0,
): StoredDeterministicSessionRecord => {
  const audit = record(`deterministic-${String(entrySeq)}`);
  return {
    deterministicEntry: {
      formatVersion: "deterministic-entry-v1",
      matchId,
      entrySeq,
      kind: "action",
      playerId: p1,
      action: { type: "endMainPhase" },
      verification: {
        stateSeqBefore: 1 as StateSeq,
        actionSeqBefore: entrySeq,
        stateHashBefore: `before-${String(entrySeq)}`,
        stateSeqAfter: 2 as StateSeq,
        actionSeqAfter: entrySeq + 1,
        stateHashAfter: `after-${String(entrySeq)}`,
        hashScope: "gameplay-v1",
      },
    },
    audit: {
      type: "clientEnvelope",
      envelope: audit.envelope,
      result: audit.result,
      recordedAt: audit.recordedAt,
    },
  };
};

const deterministicCheckpoint =
  (): StoredDeterministicCheckpointRecord => ({
    checkpoint: {
      checkpointVersion: "deterministic-checkpoint-v1",
      matchId,
      checkpointId: "checkpoint-1",
      reason: "recoverySnapshot",
      stateSeq: 1 as StateSeq,
      actionSeq: 0,
      stateHash: "checkpoint-hash",
      hashScope: "gameplay-v1",
    } satisfies DeterministicCheckpoint,
    recordedAt: "2026-05-30T00:00:00.000Z",
  });

describe("redis match persistence", () => {
  test("saves and loads state metadata manifest actions and decisions", async () => {
    const redis = new FakeRedis();
    const persistence = createRedisMatchPersistence(redis);
    const setup = await createFixtureDevMatchSetup(matchId);
    const local = createLocalDevMatch(setup);
    const action = record("action-1");
    const decision = record("decision-1");

    await persistence.saveSnapshot({
      metadata: metadata(),
      state: local.state,
      manifest: local.state.cardManifest,
      actions: [action],
      decisions: [decision],
    });
    await persistence.appendAction({ matchId, record: record("action-2") });
    await persistence.appendDecision({
      matchId,
      record: record("decision-2"),
    });

    const loaded = await persistence.loadSnapshot(matchId);
    expect(loaded?.metadata.matchId).toBe(matchId);
    expect(loaded?.state.matchId).toBe(matchId);
    expect(loaded?.manifest.manifestHash).toBe(
      local.state.cardManifest.manifestHash,
    );
    expect(loaded?.actions.map((item) => item.envelope.clientActionId)).toEqual(
      ["action-1", "action-2"],
    );
    expect(
      loaded?.decisions.map((item) => item.envelope.clientActionId),
    ).toEqual(["decision-1", "decision-2"]);
  });

  test("persists deterministic session records for recovery", async () => {
    const redis = new FakeRedis();
    const persistence = createRedisMatchPersistence(redis);
    const setup = await createFixtureDevMatchSetup(matchId);
    const local = createLocalDevMatch(setup);
    const checkpoint = deterministicCheckpoint();
    const tailRecord = deterministicRecord();

    await persistence.saveSnapshot({
      metadata: metadata(),
      state: local.state,
      manifest: local.state.cardManifest,
      actions: [],
      decisions: [],
      deterministicLogVersion: "deterministic-entry-v1",
      deterministicEntriesSinceSnapshot: [],
      deterministicCheckpoints: [checkpoint],
    });
    await persistence.appendDeterministicEntry({
      matchId,
      record: tailRecord,
    });

    const loaded = await persistence.loadSnapshot(matchId);

    expect(
      loaded?.deterministicEntriesSinceSnapshot?.map(
        (stored) => stored.deterministicEntry,
      ),
    ).toEqual([tailRecord.deterministicEntry]);
    expect(
      loaded?.deterministicCheckpoints?.map((stored) => stored.checkpoint),
    ).toEqual([checkpoint.checkpoint]);
  });

  test("ignores stale legacy logs after a newer snapshot is current", async () => {
    const redis = new FakeRedis();
    const persistence = createRedisMatchPersistence(redis);
    const setup = await createFixtureDevMatchSetup(matchId);
    const local = createLocalDevMatch(setup);

    await persistence.saveSnapshot({
      metadata: metadata(),
      state: local.state,
      manifest: local.state.cardManifest,
      actions: [],
      decisions: [],
    });
    redis.lists.set("match:redis-match:actions", [
      JSON.stringify(record("stale-action")),
    ]);
    redis.lists.set("match:redis-match:decisions", [
      JSON.stringify(record("stale-decision")),
    ]);

    const loaded = await persistence.loadSnapshot(matchId);

    expect(loaded?.actions).toEqual([]);
    expect(loaded?.decisions).toEqual([]);
  });

  test("does not discover a snapshot until its current pointer is committed", async () => {
    const redis = new FakeRedis();
    const persistence = createRedisMatchPersistence(redis);
    const setup = await createFixtureDevMatchSetup(matchId);
    const local = createLocalDevMatch(setup);
    redis.failSetWhen = (key) => key.includes(":snapshots:");

    await expect(
      persistence.saveSnapshot({
        metadata: metadata(),
        state: local.state,
        manifest: local.state.cardManifest,
        actions: [],
        decisions: [],
      }),
    ).rejects.toThrow(/set failed/u);

    await expect(persistence.listActiveMatchIds()).resolves.toEqual([]);
  });

  test("removes old snapshot generations after committing a new snapshot", async () => {
    const redis = new FakeRedis();
    const persistence = createRedisMatchPersistence(redis);
    const setup = await createFixtureDevMatchSetup(matchId);
    const local = createLocalDevMatch(setup);

    await persistence.saveSnapshot({
      metadata: metadata(),
      state: local.state,
      manifest: local.state.cardManifest,
      actions: [record("old-action")],
      decisions: [],
    });
    const firstGenerationKeys = [
      ...redis.strings.keys(),
      ...redis.lists.keys(),
    ].filter((key) => key.includes(":snapshots:"));

    await persistence.saveSnapshot({
      metadata: metadata(),
      state: local.state,
      manifest: local.state.cardManifest,
      actions: [],
      decisions: [record("new-decision")],
    });

    const remainingKeys = new Set([
      ...redis.strings.keys(),
      ...redis.lists.keys(),
    ]);
    expect(firstGenerationKeys.filter((key) => remainingKeys.has(key))).toEqual(
      [],
    );
    expect(
      [...remainingKeys].filter((key) => key.includes(":snapshots:")).length,
    ).toBeGreaterThan(0);
  });

  test("lists active matches with scan-style discovery", async () => {
    const redis = new FakeRedis();
    const persistence = createRedisMatchPersistence(redis);
    redis.strings.set("match:redis-match:current", "1:generation");

    await expect(persistence.listActiveMatchIds()).resolves.toEqual([matchId]);
    expect(redis.scanPatterns).toEqual(["match:*:current", "match:*:meta"]);
  });

  test("uses atomic owner locks and releases only matching owners", async () => {
    const redis = new FakeRedis();
    const persistence = createRedisMatchPersistence(redis);

    const acquired = await persistence.tryAcquireRecoveryLock({
      matchId,
      ownerInstanceId: "owner-1",
      now: "2026-05-30T00:00:00.000Z",
      ttlMs: 30_000,
    });
    const blocked = await persistence.tryAcquireRecoveryLock({
      matchId,
      ownerInstanceId: "owner-2",
      now: "2026-05-30T00:00:01.000Z",
      ttlMs: 30_000,
    });
    const wrongOwnerLock = {
      matchId,
      ownerInstanceId: "owner-2",
      acquiredAt: "2026-05-30T00:00:01.000Z",
      expiresAt: "2026-05-30T00:00:31.000Z",
    };
    await persistence.releaseRecoveryLock({ lock: wrongOwnerLock });
    const stillBlocked = await persistence.tryAcquireRecoveryLock({
      matchId,
      ownerInstanceId: "owner-2",
      now: "2026-05-30T00:00:02.000Z",
      ttlMs: 30_000,
    });
    if (acquired === undefined) {
      throw new Error("Expected first lock acquisition.");
    }
    await persistence.releaseRecoveryLock({ lock: acquired });
    const reacquired = await persistence.tryAcquireRecoveryLock({
      matchId,
      ownerInstanceId: "owner-2",
      now: "2026-05-30T00:00:03.000Z",
      ttlMs: 30_000,
    });

    expect(acquired.ownerInstanceId).toBe("owner-1");
    expect(blocked).toBeUndefined();
    expect(stillBlocked).toBeUndefined();
    expect(reacquired?.ownerInstanceId).toBe("owner-2");
  });

  test("does not release a recovery lock reacquired after a stale owner read", async () => {
    const redis = new FakeRedis();
    const persistence = createRedisMatchPersistence(redis);

    const firstLock = await persistence.tryAcquireRecoveryLock({
      matchId,
      ownerInstanceId: "owner-1",
      now: "2026-05-30T00:00:00.000Z",
      ttlMs: 1_000,
    });
    if (firstLock === undefined) {
      throw new Error("Expected first lock acquisition.");
    }
    const secondLock = {
      matchId,
      ownerInstanceId: "owner-2",
      acquiredAt: "2026-05-30T00:00:02.000Z",
      expiresAt: "2026-05-30T00:00:03.000Z",
    };
    redis.afterGet = (key) => {
      if (key === "match:redis-match:locks") {
        redis.afterGet = undefined;
        redis.strings.set(key, JSON.stringify(secondLock));
      }
    };

    await persistence.releaseRecoveryLock({ lock: firstLock });

    expect(redis.strings.get("match:redis-match:locks")).toBe(
      JSON.stringify(secondLock),
    );
  });

  test("writes freeze metadata", async () => {
    const redis = new FakeRedis();
    const persistence = createRedisMatchPersistence(redis);

    await persistence.freezeMatch({
      matchId,
      reason: "recovery snapshot missing",
      frozenAt: "2026-05-30T00:00:00.000Z",
    });

    expect(redis.strings.get("match:redis-match:freeze")).toContain(
      "recovery snapshot missing",
    );
  });
});
