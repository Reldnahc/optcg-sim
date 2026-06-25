import type { CompletedMatchReplayDetail } from "./postgres-completed-match.js";
import {
  reconstructReplayFrames,
  type ReplayApiFrame,
  type ReplayFrameReconstructionResult,
} from "./replay-frame-reconstruction.js";

export interface ReplayFrameChunkReady {
  readonly status: "ready";
  readonly frameCount: number;
  readonly start: number;
  readonly limit: number;
  readonly frames: readonly ReplayApiFrame[];
}

export type ReplayFrameChunkResult =
  | ReplayFrameChunkReady
  | Extract<ReplayFrameReconstructionResult, { readonly status: "failed" }>;

export interface ReplayFrameCache {
  readonly getFrameChunk: (
    detail: CompletedMatchReplayDetail,
    window: ReplayFrameWindow,
  ) => Promise<ReplayFrameChunkResult>;
}

export interface ReplayFrameWindow {
  readonly start: number;
  readonly limit: number;
}

export interface CreateReplayFrameCacheOptions {
  readonly maxEntries?: number;
  readonly reconstruct?: (
    detail: CompletedMatchReplayDetail,
    window?: ReplayFrameWindow,
  ) =>
    | Promise<ReplayFrameReconstructionResult>
    | ReplayFrameReconstructionResult;
}

const defaultMaxEntries = 50;
const defaultFrameLimit = 20;
const maxFrameLimit = 50;

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const replayCacheKey = (detail: CompletedMatchReplayDetail): string => {
  const replay = detail.replay;
  const artifactIdentity =
    stringValue(replay["artifactSha256"]) ??
    [
      stringValue(replay["replayFormatVersion"]),
      stringValue(replay["initialStateHash"]),
      stringValue(replay["finalStateHash"]),
      numberValue(replay["artifactSizeBytes"]),
    ]
      .filter((value) => value !== undefined)
      .join(":");
  return `${detail.matchId}:${artifactIdentity}`;
};

const replayFrameWindowCacheKey = (window: ReplayFrameWindow): string =>
  `${String(window.start)}:${String(window.limit)}`;

const trimCache = (
  cache: Map<string, Promise<ReplayFrameReconstructionResult>>,
  maxEntries: number,
): void => {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== "string") {
      return;
    }
    cache.delete(oldestKey);
  }
};

export const replayFrameWindowFromSearchParams = (
  searchParams: URLSearchParams,
): ReplayFrameWindow => {
  const start = Number(searchParams.get("start") ?? "0");
  const limit = Number(searchParams.get("limit") ?? String(defaultFrameLimit));
  return {
    start: Number.isFinite(start) ? Math.max(0, Math.trunc(start)) : 0,
    limit: Number.isFinite(limit)
      ? Math.min(maxFrameLimit, Math.max(1, Math.trunc(limit)))
      : defaultFrameLimit,
  };
};

export const publicReplayDetail = (
  detail: CompletedMatchReplayDetail,
): CompletedMatchReplayDetail => ({
  ...detail,
  replay: Object.fromEntries(
    [
      "replayFormatVersion",
      "manifestHash",
      "manifestSnapshot",
      "artifactSha256",
      "artifactSizeBytes",
    ].flatMap((key) => {
      const value = detail.replay[key];
      return value === undefined || value === null ? [] : [[key, value]];
    }),
  ),
});

export const createReplayFrameCache = ({
  maxEntries = defaultMaxEntries,
  reconstruct = reconstructReplayFrames,
}: CreateReplayFrameCacheOptions = {}): ReplayFrameCache => {
  const cache = new Map<string, Promise<ReplayFrameReconstructionResult>>();
  return {
    async getFrameChunk(detail, window) {
      const key = `${replayCacheKey(detail)}:${replayFrameWindowCacheKey(
        window,
      )}`;
      const cached = cache.get(key);
      const reconstructionPromise =
        cached === undefined
          ? Promise.resolve(reconstruct(detail, window)).catch(
              (error: unknown) => {
                cache.delete(key);
                throw error;
              },
            )
          : (() => {
              cache.delete(key);
              return cached;
            })();
      cache.set(key, reconstructionPromise);
      trimCache(cache, maxEntries);
      const reconstructed = await reconstructionPromise;
      if (reconstructed.status === "failed") {
        return reconstructed;
      }
      const frameCount =
        reconstructed.frameCount ?? reconstructed.frames.length;
      const start = Math.min(window.start, frameCount);
      return {
        status: "ready",
        frameCount,
        start,
        limit: window.limit,
        frames:
          reconstructed.frameCount === undefined
            ? reconstructed.frames.slice(
                start,
                Math.min(reconstructed.frames.length, start + window.limit),
              )
            : reconstructed.frames,
      };
    },
  };
};
