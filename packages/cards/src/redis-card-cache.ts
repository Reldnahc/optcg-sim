import type { CardDataCache } from "./card-repository.js";

export interface RedisJsonClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: { readonly EX: number },
  ): Promise<unknown>;
}

export const createRedisCardDataCacheFromClient = (
  client: RedisJsonClient,
): CardDataCache => ({
  async getJson(key: string): Promise<unknown> {
    const value = await client.get(key);
    if (value === null) {
      return undefined;
    }
    try {
      return JSON.parse(value) as unknown;
    } catch (error) {
      throw new Error(
        `Invalid JSON stored in Redis card cache for ${key}`,
        error instanceof Error ? { cause: error } : undefined,
      );
    }
  },
  async setJson(
    key: string,
    value: unknown,
    options?: { readonly ttlSeconds: number },
  ): Promise<void> {
    await client.set(key, JSON.stringify(value), {
      EX: options?.ttlSeconds ?? 60 * 60 * 24,
    });
  },
});

export const createRedisCardDataCache = async (input: {
  readonly url: string;
}): Promise<CardDataCache> => {
  const redis = await import("redis");
  const client = redis.createClient({ url: input.url });
  await client.connect();
  return createRedisCardDataCacheFromClient(client);
};
