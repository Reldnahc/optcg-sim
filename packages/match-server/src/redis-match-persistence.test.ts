import { describe, expect, test } from "vitest";
import type { MatchId, PlayerId } from "@optcg/types";

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
  StoredSessionRecord,
} from "./session-types.js";

const matchId = "redis-match" as MatchId;
const p1 = "p1" as PlayerId;

class FakeRedis implements RedisLike {
  public readonly strings = new Map<string, string>();
  public readonly lists = new Map<string, string[]>();
  public readonly scanPatterns: string[] = [];

  public get(key: string): Promise<string | null> {
    return Promise.resolve(this.strings.get(key) ?? null);
  }

  public set(
    key: string,
    value: string,
    options?: RedisSetOptions,
  ): Promise<"OK" | null> {
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
    const suffix = options.match.replace(/^match:\*/u, "");
    const keys = [...this.strings.keys()].filter(
      (key) => key.startsWith("match:") && key.endsWith(suffix),
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

  test("lists active matches with scan-style discovery", async () => {
    const redis = new FakeRedis();
    const persistence = createRedisMatchPersistence(redis);
    redis.strings.set("match:redis-match:meta", "{}");

    await expect(persistence.listActiveMatchIds()).resolves.toEqual([matchId]);
    expect(redis.scanPatterns).toEqual(["match:*:meta"]);
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
    await persistence.releaseRecoveryLock({
      matchId,
      ownerInstanceId: "owner-2",
    });
    const stillBlocked = await persistence.tryAcquireRecoveryLock({
      matchId,
      ownerInstanceId: "owner-2",
      now: "2026-05-30T00:00:02.000Z",
      ttlMs: 30_000,
    });
    await persistence.releaseRecoveryLock({
      matchId,
      ownerInstanceId: "owner-1",
    });
    const reacquired = await persistence.tryAcquireRecoveryLock({
      matchId,
      ownerInstanceId: "owner-2",
      now: "2026-05-30T00:00:03.000Z",
      ttlMs: 30_000,
    });

    expect(acquired?.ownerInstanceId).toBe("owner-1");
    expect(blocked).toBeUndefined();
    expect(stillBlocked).toBeUndefined();
    expect(reacquired?.ownerInstanceId).toBe("owner-2");
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
