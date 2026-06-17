import { describe, expect, test } from "vitest";
import type { MatchId, PlayerId } from "@optcg/types";

import {
  createDefaultLobbySeats,
  createRedisLobbyStore,
  type CustomLobbyState,
} from "./lobby-store.js";
import type { RedisLike, RedisSetOptions } from "./redis-match-persistence.js";

class FakeRedis implements RedisLike {
  public readonly strings = new Map<string, string>();
  public readonly lists = new Map<string, string[]>();

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

  public compareAndDelete(
    key: string,
    expectedValue: string,
  ): Promise<boolean> {
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

  public scan(): Promise<[string, string[]]> {
    return Promise.resolve(["0", []]);
  }
}

const lobby = (): CustomLobbyState => ({
  lobbyId: "lobby-test",
  settings: { formatId: "Standard" },
  seats: createDefaultLobbySeats(),
});

describe("redis lobby store", () => {
  test("stores and loads lobby state from Redis", async () => {
    const redis = new FakeRedis();
    const store = createRedisLobbyStore({ redis });

    await store.createLobby(lobby());

    expect(await store.getLobby("lobby-test")).toEqual(lobby());
  });

  test("stores lobby join code aliases in Redis", async () => {
    const redis = new FakeRedis();
    const store = createRedisLobbyStore({ redis });

    const joinCode = await store.createLobbyJoinCode("lobby-test");

    expect(joinCode).toMatch(/^[0-9a-z]{4}$/u);
    expect(await store.getLobbyIdByJoinCode(joinCode.toUpperCase())).toBe(
      "lobby-test",
    );
  });

  test("repoints lobby join code aliases in Redis", async () => {
    const redis = new FakeRedis();
    const store = createRedisLobbyStore({ redis });
    const joinCode = await store.createLobbyJoinCode("lobby-old");

    await store.setLobbyJoinCode("lobby-new", joinCode);

    expect(await store.getLobbyIdByJoinCode(joinCode)).toBe("lobby-new");
  });

  test("stores lobby match aliases in Redis", async () => {
    const redis = new FakeRedis();
    const store = createRedisLobbyStore({ redis });

    await store.setLobbyMatchId("lobby-test", "match-test" as MatchId);

    expect(await store.getLobbyIdByMatchId("match-test" as MatchId)).toBe(
      "lobby-test",
    );
  });

  test("updates lobby state under a Redis lock", async () => {
    const redis = new FakeRedis();
    const store = createRedisLobbyStore({ redis });
    await store.createLobby(lobby());

    const result = await store.updateLobby("lobby-test", (state) => {
      const seat = state.seats["p1"];
      if (seat === undefined) {
        throw new Error("Expected p1 seat.");
      }
      seat.subject = {
        type: "user",
        userId: "user-1",
        sessionId: "session-1",
      };
      return Promise.resolve(seat.playerId);
    });

    expect(result).toBe("p1" as PlayerId);
    expect((await store.getLobby("lobby-test"))?.seats["p1"]?.subject).toEqual({
      type: "user",
      userId: "user-1",
      sessionId: "session-1",
    });
  });

  test("fails closed when the lobby lock is already held", async () => {
    const redis = new FakeRedis();
    const store = createRedisLobbyStore({ redis });
    await store.createLobby(lobby());
    await redis.set("lobby:lobby-test:lock", "other-owner", { nx: true });

    await expect(
      store.updateLobby("lobby-test", () => Promise.resolve(undefined)),
    ).rejects.toThrow(/Lobby is busy/u);
  });
});
