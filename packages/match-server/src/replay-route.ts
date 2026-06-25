import type { IncomingMessage, ServerResponse } from "node:http";
import type { MatchId } from "@optcg/types";

import { sendJson } from "./http-response.js";
import type { CompletedMatchReplayRepository } from "./postgres-completed-match.js";
import type { ReplayDetailCache } from "./replay-detail-cache.js";
import {
  createLegacyReplayFrameCache,
  replayFrameWindowFromSearchParams,
  type LegacyReplayFrameCache,
} from "./replay-frame-cache.js";
import { reconstructReplayFramesOffThread as legacyReplayFrameReconstruction } from "./replay-frame-worker-dispatch.js";
import { isReplayDisplayArtifactV1 } from "./replay-display-artifact.js";

const defaultLegacyReplayFrameCache = createLegacyReplayFrameCache({
  reconstruct: legacyReplayFrameReconstruction,
});

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
    if (isReplayDisplayArtifactV1(replay.replay["replayDisplayArtifact"])) {
      sendJson(response, 410, {
        errors: [
          "Replay frames are served by the replay display artifact for display-v1 rows.",
        ],
      });
      return true;
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    const frameReconstruction = await legacyReplayFrameCache.getFrameChunk(
      replay,
      replayFrameWindowFromSearchParams(url.searchParams),
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
    sendJson(response, 200, { replay });
    return true;
  }
  return false;
};
