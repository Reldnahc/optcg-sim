import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CardId, PoneglyphCardDetail } from "@optcg/types";

import { validatePoneglyphCardDetail } from "./poneglyph-schema.js";

export type CardDataCacheLookupOptions = {
  lang?: string;
};

export type CardDataCacheWriteOptions = CardDataCacheLookupOptions & {
  ttlSeconds?: number;
};

export type CardDataCache = {
  clear: () => Promise<void>;
  delete: (
    cardNumber: CardId,
    options?: CardDataCacheLookupOptions,
  ) => Promise<void>;
  get: (
    cardNumber: CardId,
    options?: CardDataCacheLookupOptions,
  ) => Promise<PoneglyphCardDetail | undefined>;
  set: (
    cardNumber: CardId,
    cardDetail: PoneglyphCardDetail,
    options?: CardDataCacheWriteOptions,
  ) => Promise<void>;
};

export type InMemoryCardDataCacheOptions = {
  seed?: Record<string, unknown>;
};

export function createInMemoryCardDataCache(
  options?: InMemoryCardDataCacheOptions,
): CardDataCache {
  const store = new Map<string, unknown>(Object.entries(options?.seed ?? {}));

  return {
    clear() {
      store.clear();
      return Promise.resolve();
    },

    delete(cardNumber, lookupOptions) {
      store.delete(toCacheKey(cardNumber, lookupOptions));
      return Promise.resolve();
    },

    get(cardNumber, lookupOptions) {
      const key = toCacheKey(cardNumber, lookupOptions);
      const cached = store.get(key);

      if (cached === undefined) {
        return Promise.resolve(undefined);
      }

      try {
        return Promise.resolve(validateCachedCardDetail(cardNumber, cached));
      } catch (error) {
        return Promise.reject(
          error instanceof Error
            ? error
            : new Error(`Invalid cached card detail for ${cardNumber}`),
        );
      }
    },

    set(cardNumber, cardDetail, lookupOptions) {
      const key = toCacheKey(cardNumber, lookupOptions);
      store.set(key, cardDetail);
      return Promise.resolve();
    },
  };
}

export type FileCardDataCacheOptions = {
  directory: string;
};

export function createFileCardDataCache(
  options: FileCardDataCacheOptions,
): CardDataCache {
  const directory = path.resolve(options.directory);

  return {
    async clear() {
      await rm(directory, { force: true, recursive: true });
    },

    async delete(cardNumber, lookupOptions) {
      await rm(toCacheFilePath(directory, cardNumber, lookupOptions), {
        force: true,
      });
    },

    async get(cardNumber, lookupOptions) {
      const filePath = toCacheFilePath(directory, cardNumber, lookupOptions);
      const source = await readFileOrUndefined(filePath);

      if (source === undefined) {
        return undefined;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(source) as unknown;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown error";
        throw new Error(
          `Invalid cached card detail JSON for ${cardNumber}: ${message}`,
        );
      }

      return validateCachedCardDetail(cardNumber, parsed);
    },

    async set(cardNumber, cardDetail, lookupOptions) {
      await mkdir(directory, { recursive: true });
      const filePath = toCacheFilePath(directory, cardNumber, lookupOptions);
      await writeFile(filePath, `${JSON.stringify(cardDetail)}\n`, "utf8");
    },
  };
}

export const REDIS_CARD_DATA_CACHE_DEFERRED =
  "Redis card-data cache adapter intentionally deferred in CARD-001F.";

function toCacheKey(
  cardNumber: CardId,
  options?: CardDataCacheLookupOptions,
): string {
  const lang = options?.lang ?? "en";
  return `${lang}:${cardNumber}`;
}

function toCacheFilePath(
  directory: string,
  cardNumber: CardId,
  options?: CardDataCacheLookupOptions,
): string {
  return path.join(
    directory,
    `${encodeURIComponent(toCacheKey(cardNumber, options))}.json`,
  );
}

function validateCachedCardDetail(
  requestedCardNumber: CardId,
  value: unknown,
): PoneglyphCardDetail {
  const detail = validatePoneglyphCardDetail(value);
  if (detail.card_number !== requestedCardNumber) {
    throw new Error(
      `Cached card_number mismatch for ${requestedCardNumber}: received ${detail.card_number}`,
    );
  }
  return detail;
}

async function readFileOrUndefined(
  filePath: string,
): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
