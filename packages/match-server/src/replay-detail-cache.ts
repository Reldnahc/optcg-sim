import type { MatchId } from "@optcg/types";

import type { CompletedMatchReplayDetail } from "./postgres-completed-match.js";

export interface ReplayDetailCache {
  readonly getReplay: (
    matchId: MatchId,
    loadReplay: () => Promise<CompletedMatchReplayDetail | undefined>,
  ) => Promise<CompletedMatchReplayDetail | undefined>;
}

export interface CreateReplayDetailCacheOptions {
  readonly maxEntries?: number;
}

const defaultMaxEntries = 25;

const trimCache = (
  cache: Map<MatchId, Promise<CompletedMatchReplayDetail | undefined>>,
  maxEntries: number,
): void => {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }
    cache.delete(oldestKey);
  }
};

export const createReplayDetailCache = ({
  maxEntries = defaultMaxEntries,
}: CreateReplayDetailCacheOptions = {}): ReplayDetailCache => {
  const cache = new Map<
    MatchId,
    Promise<CompletedMatchReplayDetail | undefined>
  >();
  return {
    getReplay(matchId, loadReplay) {
      const cached = cache.get(matchId);
      if (cached !== undefined) {
        cache.delete(matchId);
        cache.set(matchId, cached);
        return cached;
      }
      const loaded = loadReplay().then(
        (replay) => {
          if (replay === undefined) {
            cache.delete(matchId);
          }
          return replay;
        },
        (error: unknown) => {
          cache.delete(matchId);
          throw error;
        },
      );
      cache.set(matchId, loaded);
      trimCache(cache, maxEntries);
      return loaded;
    },
  };
};
