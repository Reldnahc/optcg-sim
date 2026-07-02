import type { IncomingMessage, ServerResponse } from "node:http";
import type { MatchId, PlayerId } from "@optcg/types";

import type { LocalDevMatchRegistry } from "./dev-local-match-registry.js";
import type { DevSocketConnection } from "./dev-socket-connections.js";
import { broadcastMatchState } from "./dev-broadcasts.js";
import { sendJson, sendMatchNotFound } from "./http-response.js";
import { isRecord, readRequestJson } from "./request-json.js";

interface FirstPlayerChoiceRequest {
  playerId?: unknown;
  choice?: unknown;
}

export const handleFirstPlayerChoiceRequest = async (params: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly matchId: MatchId;
  readonly resource: string | undefined;
  readonly registry: LocalDevMatchRegistry;
  readonly matchConnections: Set<DevSocketConnection>;
}): Promise<boolean> => {
  if (
    params.request.method !== "POST" ||
    params.resource !== "first-player-choice"
  ) {
    return false;
  }

  let body: unknown;
  try {
    body = await readRequestJson(params.request);
  } catch {
    sendJson(params.response, 400, { errors: ["Request body must be JSON."] });
    return true;
  }
  const choiceRequest: FirstPlayerChoiceRequest = isRecord(body) ? body : {};
  const playerId = choiceRequest.playerId;
  const choice = choiceRequest.choice;
  if (
    typeof playerId !== "string" ||
    (choice !== "goFirst" && choice !== "goSecond")
  ) {
    sendJson(params.response, 400, {
      errors: ["First-player choice requires playerId and choice."],
    });
    return true;
  }
  const result = await params.registry.chooseFirstPlayer(
    params.matchId,
    playerId as PlayerId,
    choice,
  );
  if (result === "matchNotFound") {
    sendMatchNotFound(params.response, params.matchId);
    return true;
  }
  if (result === "alreadyStarted") {
    sendJson(params.response, 409, {
      errors: ["First-player choice is already resolved."],
    });
    return true;
  }
  if (result === "notChooser") {
    sendJson(params.response, 403, {
      errors: ["Only the selected first-player chooser can answer."],
    });
    return true;
  }
  broadcastMatchState(params.matchId, params.registry, params.matchConnections);
  sendJson(params.response, 200, result);
  return true;
};
