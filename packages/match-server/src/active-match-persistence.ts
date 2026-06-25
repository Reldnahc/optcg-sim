import { createRedisClientForLobbyStore } from "./lobby-store.js";
import type { CreateMatchHttpServerOptions } from "./match-http-server-options.js";
import { resolveRedisConfig } from "./redis-config.js";
import { createRedisMatchPersistence } from "./redis-match-persistence.js";
import type { MatchPersistence } from "./session-types.js";

export const resolveActiveMatchPersistence = async (
  options: CreateMatchHttpServerOptions,
): Promise<MatchPersistence | undefined> => {
  if (options.matchPersistence !== undefined) {
    return options.matchPersistence;
  }
  if (options.recoverActiveMatches !== true) {
    return undefined;
  }
  const redisConfig = resolveRedisConfig({
    redisUrl: options.redisUrl,
    redisMode: options.redisMode,
  });
  if (redisConfig.redisUrl === undefined) {
    return undefined;
  }
  return createRedisMatchPersistence(
    await createRedisClientForLobbyStore(redisConfig.redisUrl),
  );
};
