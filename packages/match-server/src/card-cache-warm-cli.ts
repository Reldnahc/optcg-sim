import {
  createPoneglyphHttpClient,
  createRedisCardDataCache,
  fetchDevPoneglyphCatalogSnapshot,
} from "@optcg/cards";
import { createRuntimeSupportedCardRepository } from "@optcg/card-support";
import type { CardId } from "@optcg/types";
import { warmCardCache } from "optcg-card-cache";
import { writeActiveSimCardCacheVersions } from "./sim-card-cache-versions.js";

const defaultBatchSize = 40;
const defaultDelayMs = 300;

interface WarmCliConfig {
  readonly redisUrl: string;
  readonly poneglyphBaseUrl: string;
  readonly batchSize: number;
  readonly delayMs: number;
}

const readConfig = (): WarmCliConfig => {
  const redisUrl = process.env["REDIS_URL"];
  if (redisUrl === undefined || redisUrl.length === 0) {
    throw new Error("REDIS_URL is required to warm the card cache.");
  }
  return {
    redisUrl,
    poneglyphBaseUrl:
      process.env["PONEGLYPH_API_BASE_URL"] ?? "https://api.poneglyph.one",
    batchSize: readPositiveIntegerEnv(
      "PONEGLYPH_CARD_CACHE_BATCH_SIZE",
      defaultBatchSize,
    ),
    delayMs: readNonNegativeIntegerEnv(
      "PONEGLYPH_CARD_CACHE_DELAY_MS",
      defaultDelayMs,
    ),
  };
};

const run = async (): Promise<void> => {
  const config = readConfig();
  const cache = await createRedisCardDataCache({ url: config.redisUrl });
  const catalog = await fetchDevPoneglyphCatalogSnapshot({
    baseUrl: config.poneglyphBaseUrl,
  });
  const versions = catalog.versions;
  const repository = createRuntimeSupportedCardRepository({
    cache,
    poneglyphClient: createPoneglyphHttpClient({
      baseUrl: config.poneglyphBaseUrl,
    }),
    versions,
  });
  const result = await warmCardCache({
    cardIds: catalog.cardIds,
    versions,
    cache,
    batchSize: config.batchSize,
    delayMs: config.delayMs,
    resolveCards: (ids) => repository.resolveCacheEntries(ids as CardId[]),
  });
  await writeActiveSimCardCacheVersions(cache, versions);

  process.stdout.write(`${JSON.stringify({ data: result })}\n`);
};

const readPositiveIntegerEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const readNonNegativeIntegerEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { message } })}\n`);
  process.exitCode = 1;
});
