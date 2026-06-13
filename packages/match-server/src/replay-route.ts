import type { IncomingMessage, ServerResponse } from "node:http";
import type { MatchId } from "@optcg/types";

import type { AuthProvider } from "./dev-auth.js";
import { sendJson } from "./http-response.js";
import type { CompletedMatchReplayRepository } from "./postgres-completed-match.js";

export const handleReplayRequest = async ({
  request,
  response,
  pathname,
  authProvider,
  replayRepository,
}: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly authProvider: AuthProvider;
  readonly replayRepository: CompletedMatchReplayRepository | undefined;
}): Promise<boolean> => {
  if (replayRepository === undefined) {
    return false;
  }
  if (request.method === "GET" && pathname === "/api/replays") {
    const auth = authProvider.authenticate(request);
    if (auth === undefined) {
      sendJson(response, 401, { errors: ["Account session is required."] });
      return true;
    }
    sendJson(response, 200, {
      replays: await replayRepository.listReplaysForUser(auth.subject.userId),
    });
    return true;
  }
  const detailRoute = /^\/api\/replays\/(?<matchId>[^/]+)$/u.exec(pathname);
  if (request.method === "GET" && detailRoute !== null) {
    const auth = authProvider.authenticate(request);
    if (auth === undefined) {
      sendJson(response, 401, { errors: ["Account session is required."] });
      return true;
    }
    const matchId = decodeURIComponent(
      detailRoute.groups?.["matchId"] ?? "",
    ) as MatchId;
    const replay = await replayRepository.getReplayForUser(
      auth.subject.userId,
      matchId,
    );
    if (replay === undefined) {
      sendJson(response, 404, { errors: [`Replay ${matchId} not found.`] });
      return true;
    }
    sendJson(response, 200, { replay });
    return true;
  }
  return false;
};
