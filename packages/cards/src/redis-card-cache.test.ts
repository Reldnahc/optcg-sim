import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createRedisCardDataCacheFromClient } from "./redis-card-cache.js";

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
});

class FakeRedisClient {
  readonly values = new Map<string, string>();
  readonly setCalls: Array<{
    readonly key: string;
    readonly value: string;
    readonly options: { readonly EX: number };
  }> = [];

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
}
