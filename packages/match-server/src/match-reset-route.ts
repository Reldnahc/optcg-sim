import type { IncomingMessage, ServerResponse } from "node:http";

import type { LocalDevMatchRegistry } from "./dev-local-match-registry.js";
import { sendJson, sendMatchNotFound } from "./http-response.js";
import { isDevMatchSetup } from "./local-match.js";
import { isRecord, readRequestJson } from "./request-json.js";

interface DevResetRequest {
  setup?: unknown;
}

export const handleResetRequest = async ({
  request,
  response,
  pathname,
  registry,
}: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly registry: LocalDevMatchRegistry;
}): Promise<boolean> => {
  if (request.method !== "POST" || pathname !== "/api/reset") {
    return false;
  }

  let body: unknown;
  try {
    body = await readRequestJson(request);
  } catch {
    sendJson(response, 400, { errors: ["Request body must be JSON."] });
    return true;
  }
  const resetRequest: DevResetRequest = isRecord(body) ? body : {};
  if (
    resetRequest.setup === undefined &&
    registry.getMatch(registry.defaultMatchId) === undefined
  ) {
    sendMatchNotFound(response, registry.defaultMatchId);
    return true;
  }
  if (
    resetRequest.setup !== undefined &&
    !isDevMatchSetup(resetRequest.setup)
  ) {
    sendJson(response, 400, { errors: ["Invalid dev match setup."] });
    return true;
  }
  const explicitSetup =
    resetRequest.setup === undefined ? undefined : resetRequest.setup;
  const reset = await registry.resetMatch(
    registry.defaultMatchId,
    explicitSetup,
  );
  sendJson(response, 200, reset.snapshot);
  return true;
};
