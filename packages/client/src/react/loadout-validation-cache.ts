import type {
  AccountLoadout,
  AccountLoadoutValidation,
} from "../account-client.js";

interface CachedLoadoutValidation {
  readonly validation: AccountLoadoutValidation;
  readonly expiresAtMs: number;
}

export type LoadoutValidationCache = Map<string, CachedLoadoutValidation>;

const defaultValidationCacheTtlMs = 1000 * 60 * 60 * 24;

export const createLoadoutValidationCache = (): LoadoutValidationCache =>
  new Map();

export const sharedLoadoutValidationCache = createLoadoutValidationCache();

const uncheckedValidation: AccountLoadoutValidation = {
  status: "unchecked",
  errors: [],
};

const validationCacheKeys = (
  loadout: AccountLoadout,
  formatId: string,
): string[] => {
  const keys: string[] = [];
  if (loadout.deckHash !== undefined && loadout.deckHash.length > 0) {
    keys.push(`deck:${formatId}:${loadout.deckHash}`);
  }
  keys.push(`loadout:${formatId}:${loadout.id}:${loadout.updatedAt}`);
  return keys;
};

const cachedValidationForLoadout = ({
  cache,
  loadout,
  formatId,
  nowMs,
}: {
  readonly cache: LoadoutValidationCache;
  readonly loadout: AccountLoadout;
  readonly formatId: string;
  readonly nowMs: number;
}): AccountLoadoutValidation | undefined => {
  for (const key of validationCacheKeys(loadout, formatId)) {
    const cached = cache.get(key);
    if (cached === undefined) {
      continue;
    }
    if (cached.expiresAtMs <= nowMs) {
      cache.delete(key);
      continue;
    }
    return cached.validation;
  }
  return undefined;
};

export const loadoutsWithCachedValidation = ({
  cache,
  loadouts,
  formatId,
  nowMs = Date.now(),
}: {
  readonly cache: LoadoutValidationCache;
  readonly loadouts: readonly AccountLoadout[];
  readonly formatId: string | undefined;
  readonly nowMs?: number;
}): readonly AccountLoadout[] => {
  if (formatId === undefined) {
    return loadouts.map((loadout) => ({
      ...loadout,
      validation: uncheckedValidation,
    }));
  }
  return loadouts.map((loadout) => ({
    ...loadout,
    validation:
      cachedValidationForLoadout({
        cache,
        loadout,
        formatId,
        nowMs,
      }) ?? uncheckedValidation,
  }));
};

export const rememberLoadoutValidation = ({
  cache,
  loadout,
  formatId,
  validation,
  nowMs = Date.now(),
  ttlMs = defaultValidationCacheTtlMs,
}: {
  readonly cache: LoadoutValidationCache;
  readonly loadout: AccountLoadout;
  readonly formatId: string | undefined;
  readonly validation: AccountLoadoutValidation;
  readonly nowMs?: number;
  readonly ttlMs?: number;
}): void => {
  if (formatId === undefined || validation.status === "unverified") {
    return;
  }
  const cached = {
    validation,
    expiresAtMs: nowMs + ttlMs,
  };
  for (const key of validationCacheKeys(loadout, formatId)) {
    cache.set(key, cached);
  }
};
