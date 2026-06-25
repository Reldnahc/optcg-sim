import type { IncomingMessage, ServerResponse } from "node:http";
import type { MatchId } from "@optcg/types";

import { sendJson } from "./http-response.js";
import type { CompletedMatchReplayRepository } from "./postgres-completed-match.js";
import type { ReplayDetailCache } from "./replay-detail-cache.js";
import {
  createLegacyReplayFrameCache,
  publicReplayDetail,
  replayFrameWindowFromSearchParams,
  type LegacyReplayFrameCache,
  type ReplayFrameWindow,
} from "./replay-frame-cache.js";
import { reconstructReplayFramesOffThread as legacyReplayFrameReconstruction } from "./replay-frame-worker-dispatch.js";
import { isReplayDisplayArtifactV1 } from "./replay-display-artifact.js";
import type { ReplayDisplayArtifactV1 } from "./replay-display-artifact.js";

const defaultLegacyReplayFrameCache = createLegacyReplayFrameCache({
  reconstruct: legacyReplayFrameReconstruction,
});

const displayArtifactFrameChunk = (
  artifact: ReplayDisplayArtifactV1,
  window: ReplayFrameWindow,
) => {
  const frameCount = artifact.frames.length;
  const start = Math.min(window.start, frameCount);
  return {
    status: "ready" as const,
    frameCount,
    start,
    limit: window.limit,
    frames: artifact.frames
      .slice(start, Math.min(frameCount, start + window.limit))
      .map((frame) => ({
        index: frame.index,
        actionIndex: frame.actionIndex,
        label: frame.label,
        snapshot: frame.snapshot,
      })),
  };
};

export const handleReplayRequest = async ({
  request,
  response,
  pathname,
  replayRepository,
  replayDetailCache,
  legacyReplayFrameCache = defaultLegacyReplayFrameCache,
}: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly replayRepository: CompletedMatchReplayRepository | undefined;
  readonly replayDetailCache?: ReplayDetailCache | undefined;
  readonly legacyReplayFrameCache?: LegacyReplayFrameCache | undefined;
}): Promise<boolean> => {
  if (replayRepository === undefined) {
    return false;
  }
  if (request.method === "GET" && pathname === "/api/replays") {
    sendJson(response, 200, {
      replays: await replayRepository.listReplays(),
    });
    return true;
  }
  const frameRoute = /^\/api\/replays\/(?<matchId>[^/]+)\/frames$/u.exec(
    pathname,
  );
  if (request.method === "GET" && frameRoute !== null) {
    const matchId = decodeURIComponent(
      frameRoute.groups?.["matchId"] ?? "",
    ) as MatchId;
    const replay =
      replayDetailCache === undefined
        ? await replayRepository.getReplay(matchId)
        : await replayDetailCache.getReplay(matchId, () =>
            replayRepository.getReplay(matchId),
          );
    if (replay === undefined) {
      sendJson(response, 404, { errors: [`Replay ${matchId} not found.`] });
      return true;
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    const window = replayFrameWindowFromSearchParams(url.searchParams);
    const replayDisplayArtifact = replay.replay["replayDisplayArtifact"];
    if (isReplayDisplayArtifactV1(replayDisplayArtifact)) {
      sendJson(response, 200, {
        frameReconstruction: displayArtifactFrameChunk(
          replayDisplayArtifact,
          window,
        ),
      });
      return true;
    }
    const frameReconstruction = await legacyReplayFrameCache.getFrameChunk(
      replay,
      window,
    );
    sendJson(response, 200, {
      frameReconstruction,
    });
    return true;
  }
  const detailRoute = /^\/api\/replays\/(?<matchId>[^/]+)$/u.exec(pathname);
  if (request.method === "GET" && detailRoute !== null) {
    const matchId = decodeURIComponent(
      detailRoute.groups?.["matchId"] ?? "",
    ) as MatchId;
    const replay = await replayRepository.getPublicReplay(matchId);
    if (replay === undefined) {
      sendJson(response, 404, { errors: [`Replay ${matchId} not found.`] });
      return true;
    }
    sendJson(response, 200, { replay: publicReplayDetail(replay) });
    return true;
  }
  return false;
};
