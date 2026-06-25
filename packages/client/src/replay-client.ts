import type { MatchId } from "@optcg/types";

export interface ReplayPlayerSummary {
  readonly seatId: string;
  readonly userId: string | null;
  readonly displayName: string | null;
  readonly leaderCardNumber: string;
  readonly result: "win" | "loss" | "draw";
  readonly isWinner: boolean;
}

export interface ReplayFramePayload {
  readonly index: number;
  readonly actionIndex: number;
  readonly label: string;
  readonly snapshot: unknown;
}

export type ReplayFrameReconstructionPayload =
  | {
      readonly status: "ready";
      readonly frameCount?: number;
      readonly start?: number;
      readonly limit?: number;
      readonly frames: readonly ReplayFramePayload[];
    }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly actionIndex?: number | undefined;
    };

export interface ReplayPayload {
  readonly replayFormatVersion?: string;
  readonly manifestSnapshot?: unknown;
  readonly manifestHash?: string;
  readonly artifactSha256?: string;
  readonly artifactSizeBytes?: number;
  readonly deterministicEntries?: readonly unknown[];
  readonly auditEntries?: readonly unknown[];
}

export interface ReplayDetail {
  readonly matchId: string;
  readonly status: "completed" | "draw" | "abandoned";
  readonly gameType: "ranked" | "unranked" | "dev";
  readonly formatId: string;
  readonly lobbyId: string | null;
  readonly winnerUserId: string | null;
  readonly winnerSeatId: string | null;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly turnCount: number | null;
  readonly actionCount: number;
  readonly players: readonly ReplayPlayerSummary[];
  readonly replay: ReplayPayload;
  readonly frameReconstruction?: ReplayFrameReconstructionPayload | undefined;
}

export type ReplaySummary = Omit<ReplayDetail, "replay">;

export interface ReplayFrameWindow {
  readonly start: number;
  readonly limit: number;
}

export type ReplayFrameChunkPayload =
  | {
      readonly status: "ready";
      readonly frameCount: number;
      readonly start: number;
      readonly limit: number;
      readonly frames: readonly ReplayFramePayload[];
    }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly actionIndex?: number | undefined;
    };

export interface ReplayClient {
  readonly getReplay: (matchId: MatchId | string) => Promise<ReplayDetail>;
  readonly getReplayFrames: (
    matchId: MatchId | string,
    window: ReplayFrameWindow,
  ) => Promise<ReplayFrameChunkPayload>;
  readonly listReplays: () => Promise<readonly ReplaySummary[]>;
}

export interface CreateReplayClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/u, "");

const readJson = async <T>(response: Response): Promise<T> => {
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      `Replay request failed with HTTP ${String(response.status)}: ${JSON.stringify(
        body,
      )}`,
    );
  }
  return body as T;
};

export const createReplayClient = ({
  baseUrl,
  fetch: fetchImpl = fetch,
}: CreateReplayClientOptions): ReplayClient => {
  const root = trimTrailingSlash(baseUrl);
  return {
    async listReplays() {
      const response = await fetchImpl(`${root}/api/replays`);
      const body = await readJson<{ replays: readonly ReplaySummary[] }>(
        response,
      );
      return body.replays;
    },
    async getReplay(matchId) {
      const response = await fetchImpl(
        `${root}/api/replays/${encodeURIComponent(String(matchId))}`,
      );
      const body = await readJson<{
        replay: ReplayDetail;
        frameReconstruction?: ReplayFrameReconstructionPayload | undefined;
      }>(response);
      return {
        ...body.replay,
        ...(body.frameReconstruction === undefined
          ? {}
          : { frameReconstruction: body.frameReconstruction }),
      };
    },
    async getReplayFrames(matchId, window) {
      const searchParams = new URLSearchParams({
        start: String(window.start),
        limit: String(window.limit),
      });
      const response = await fetchImpl(
        `${root}/api/replays/${encodeURIComponent(
          String(matchId),
        )}/frames?${searchParams.toString()}`,
      );
      const body = await readJson<{
        frameReconstruction: ReplayFrameChunkPayload;
      }>(response);
      return body.frameReconstruction;
    },
  };
};
