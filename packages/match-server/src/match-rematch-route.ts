import type { IncomingMessage, ServerResponse } from "node:http";
import type { MatchId, PlayerId } from "@optcg/types";

import type {
  CreatedCustomLobbyResponse,
  CustomLobbyRegistry,
  PendingRematchResponse,
} from "./custom-lobby-registry.js";
import type { AuthContext } from "./dev-auth.js";
import { sendJson, sendMatchNotFound } from "./http-response.js";
import { isRecord, readRequestJson } from "./request-json.js";

interface RematchRequest {
  playerId?: unknown;
}

const isPendingRematchResponse = (
  value: unknown,
): value is PendingRematchResponse =>
  isRecord(value) &&
  isRecord(value["rematch"]) &&
  value["rematch"]["status"] === "pending";

export const handleRematchRequest = async ({
  request,
  response,
  matchId,
  lobbyRegistry,
  auth,
  onPending,
  onCreated,
}: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly matchId: MatchId;
  readonly lobbyRegistry: CustomLobbyRegistry;
  readonly auth: AuthContext | undefined;
  readonly onPending: (requestedBy: PlayerId) => void;
  readonly onCreated: (created: CreatedCustomLobbyResponse) => void;
}): Promise<void> => {
  let body: unknown;
  try {
    body = await readRequestJson(request);
  } catch {
    sendJson(response, 400, { errors: ["Request body must be JSON."] });
    return;
  }
  const rematchRequest: RematchRequest = isRecord(body) ? body : {};
  const playerId = rematchRequest.playerId;
  if (typeof playerId !== "string") {
    sendJson(response, 400, {
      errors: ["Rematch creation requires playerId."],
    });
    return;
  }
  const result = await lobbyRegistry.createRematchLobby(
    matchId,
    playerId as PlayerId,
    auth,
  );
  if (result === "matchNotFound") {
    sendMatchNotFound(response, matchId);
    return;
  }
  if (result === "unauthenticated") {
    sendJson(response, 401, { errors: ["Rematch requires a session."] });
    return;
  }
  if (result === "forbidden") {
    sendJson(response, 403, {
      errors: ["Session token is not authorized for this match seat."],
    });
    return;
  }
  if (result === "sourceNotCompleted" || result === "noPreviousLoser") {
    sendJson(response, 409, {
      errors: ["Rematch requires a completed source match with a loser."],
    });
    return;
  }
  if (isPendingRematchResponse(result)) {
    onPending(playerId as PlayerId);
    sendJson(response, 202, result);
    return;
  }
  onCreated(result);
  sendJson(response, 201, result);
};
