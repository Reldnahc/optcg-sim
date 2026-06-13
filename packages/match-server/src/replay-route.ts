import type { IncomingMessage, ServerResponse } from "node:http";
import type { MatchId } from "@optcg/types";

import { sendJson } from "./http-response.js";
import type { CompletedMatchReplayRepository } from "./postgres-completed-match.js";

export const handleReplayRequest = async ({
  request,
  response,
  pathname,
  replayRepository,
}: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly replayRepository: CompletedMatchReplayRepository | undefined;
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
  const detailRoute = /^\/api\/replays\/(?<matchId>[^/]+)$/u.exec(pathname);
  if (request.method === "GET" && detailRoute !== null) {
    const matchId = decodeURIComponent(
      detailRoute.groups?.["matchId"] ?? "",
    ) as MatchId;
    const replay = await replayRepository.getReplay(matchId);
    if (replay === undefined) {
      sendJson(response, 404, { errors: [`Replay ${matchId} not found.`] });
      return true;
    }
    sendJson(response, 200, { replay });
    return true;
  }
  return false;
};
