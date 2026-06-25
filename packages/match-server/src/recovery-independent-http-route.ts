import type { IncomingMessage, ServerResponse } from "node:http";

import { sendJson, sendText } from "./http-response.js";
import type { CompletedMatchReplayRepository } from "./postgres-completed-match.js";
import type { ReplayDetailCache } from "./replay-detail-cache.js";
import { handleReplayRequest } from "./replay-route.js";
import { serveStaticAssetsOrNotFound } from "./static-assets.js";

const handleNotFoundRequest = (response: ServerResponse): Promise<void> => {
  sendText(response, 404, "text/plain; charset=utf-8", "Not found");
  return Promise.resolve();
};

export const handleRecoveryIndependentHttpRequest = async ({
  pathname,
  replayDetailCache,
  replayRepository,
  request,
  response,
  staticAssetsDirectory,
}: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly replayDetailCache?: ReplayDetailCache | undefined;
  readonly replayRepository: CompletedMatchReplayRepository | undefined;
  readonly staticAssetsDirectory: string | undefined;
}): Promise<boolean> => {
  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { data: { ok: true } });
    return true;
  }
  if (pathname.startsWith("/api/replays")) {
    return handleReplayRequest({
      request,
      response,
      pathname,
      replayDetailCache,
      replayRepository,
    });
  }
  if (!pathname.startsWith("/api/")) {
    await serveStaticAssetsOrNotFound(
      request,
      response,
      staticAssetsDirectory,
      () => handleNotFoundRequest(response),
    );
    return true;
  }
  return false;
};
