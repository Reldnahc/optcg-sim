import { createClient } from "redis";
import { clearRedisKeysByPatternFromClient } from "optcg-card-cache";
import type { CardDataCache } from "./card-repository.js";

export { clearRedisKeysByPatternFromClient };

export type { RedisKeyPatternClient } from "optcg-card-cache";

export interface RedisJsonClient {
  get(key: string): Promise<string | null>;
  mGet?(keys: string[]): Promise<Array<string | null>>;
  set(
    key: string,
    value: string,
    options: { readonly EX: number },
  ): Promise<unknown>;
  multi?(): RedisJsonMulti;
}

export interface RedisJsonMulti {
  set(
    key: string,
    value: string,
    options: { readonly EX: number },
  ): RedisJsonMulti;
  exec(): Promise<unknown>;
}

const defaultRedisTtlSeconds = 60 * 60 * 24;

export const createRedisCardDataCacheFromClient = (
  client: RedisJsonClient,
): CardDataCache => ({
  async getJson(key) {
    const value = await client.get(key);
    return parseRedisJsonValue(key, value);
  },
  async getJsonMany(keys) {
    if (keys.length === 0) {
      return [];
    }
    if (client.mGet === undefined) {
      return await Promise.all(
        keys.map(async (key) => await this.getJson(key)),
      );
    }
    const values = await client.mGet([...keys]);
    return values.map((value, index) =>
      parseRedisJsonValue(keys[index] ?? "unknown", value),
    );
  },
  async setJson(key, value, options) {
    await client.set(key, JSON.stringify(value), {
      EX: options?.ttlSeconds ?? defaultRedisTtlSeconds,
    });
  },
  async setJsonMany(entries) {
    if (entries.length === 0) {
      return;
    }
    const multi = client.multi?.();
    if (multi === undefined) {
      await Promise.all(
        entries.map(async (entry) => {
          await this.setJson(entry.key, entry.value, entry.options);
        }),
      );
      return;
    }
    for (const entry of entries) {
      multi.set(entry.key, JSON.stringify(entry.value), {
        EX: entry.options?.ttlSeconds ?? defaultRedisTtlSeconds,
      });
    }
    await multi.exec();
  },
});

export const createRedisCardDataCache = async (input: {
  readonly url: string;
}): Promise<CardDataCache> => {
  const client = createClient({ url: input.url });
  await client.connect();
  return createRedisCardDataCacheFromClient(client);
};

const parseRedisJsonValue = (key: string, value: string | null): unknown => {
  if (value === null) {
    return undefined;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch (error: unknown) {
    throw new Error(
      `Invalid JSON stored in Redis card cache for ${key}`,
      error instanceof Error ? { cause: error } : undefined,
    );
  }
};
