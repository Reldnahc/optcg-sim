import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  clearRedisKeysByPatternFromClient,
  createRedisCardDataCacheFromClient,
} from "./redis-card-cache.js";

describe("Redis card data cache", () => {
  test("reads JSON values and treats missing keys as undefined", async () => {
    const client = new FakeRedisClient();
    client.values.set("card:key", JSON.stringify({ cardId: "OP01-001" }));
    const cache = createRedisCardDataCacheFromClient(client);

    assert.deepEqual(await cache.getJson("card:key"), { cardId: "OP01-001" });
    assert.equal(await cache.getJson("missing"), undefined);
  });

  test("writes JSON values with an expiry", async () => {
    const client = new FakeRedisClient();
    const cache = createRedisCardDataCacheFromClient(client);

    await cache.setJson("card:key", { cardId: "OP01-001" }, { ttlSeconds: 90 });

    assert.deepEqual(client.setCalls, [
      {
        key: "card:key",
        value: JSON.stringify({ cardId: "OP01-001" }),
        options: { EX: 90 },
      },
    ]);
  });

  test("fails clearly when cached JSON is malformed", async () => {
    const client = new FakeRedisClient();
    client.values.set("card:key", "{bad json");
    const cache = createRedisCardDataCacheFromClient(client);

    await assert.rejects(
      () => cache.getJson("card:key"),
      /Invalid JSON stored in Redis card cache for card:key/u,
    );
  });

  test("clears only matching Redis cache keys by pattern", async () => {
    const client = new FakeRedisClient();
    client.values.set("card:v1:OP01-001", "{}");
    client.values.set("card:v1:OP01-002", "{}");
    client.values.set("session:token", "{}");

    const deleted = await clearRedisKeysByPatternFromClient(client, "card:*");

    assert.equal(deleted, 2);
    assert.deepEqual([...client.values.keys()], ["session:token"]);
    assert.deepEqual(client.delCalls, [
      ["card:v1:OP01-001", "card:v1:OP01-002"],
    ]);
  });

  test("clearing an empty pattern match is a no-op", async () => {
    const client = new FakeRedisClient();
    client.values.set("session:token", "{}");

    const deleted = await clearRedisKeysByPatternFromClient(client, "card:*");

    assert.equal(deleted, 0);
    assert.deepEqual(client.delCalls, []);
  });
});

class FakeRedisClient {
  readonly values = new Map<string, string>();
  readonly setCalls: Array<{
    readonly key: string;
    readonly value: string;
    readonly options: { readonly EX: number };
  }> = [];
  readonly delCalls: string[][] = [];

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  set(
    key: string,
    value: string,
    options: { readonly EX: number },
  ): Promise<"OK"> {
    this.values.set(key, value);
    this.setCalls.push({ key, value, options });
    return Promise.resolve("OK");
  }

  scanIterator(options: {
    readonly MATCH: string;
    readonly COUNT: number;
  }): AsyncIterable<string[]> {
    const prefix = options.MATCH.endsWith("*")
      ? options.MATCH.slice(0, -1)
      : options.MATCH;
    const keys = [...this.values.keys()].filter((key) =>
      key.startsWith(prefix),
    );
    const batches = keys.length > 0 ? [keys] : [];
    return {
      [Symbol.asyncIterator](): AsyncIterator<string[]> {
        let index = 0;
        return {
          next(): Promise<IteratorResult<string[]>> {
            const value = batches[index];
            index += 1;
            return Promise.resolve(
              value === undefined
                ? { done: true, value: undefined }
                : { done: false, value },
            );
          },
        };
      },
    };
  }

  del(keys: string[]): Promise<number> {
    this.delCalls.push([...keys]);
    let deleted = 0;
    for (const key of keys) {
      if (this.values.delete(key)) {
        deleted += 1;
      }
    }
    return Promise.resolve(deleted);
  }
}
