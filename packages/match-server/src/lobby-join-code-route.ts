import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  CreatedCustomLobbyResponse,
  CustomLobbyRegistry,
} from "./custom-lobby-registry.js";
import type { AuthProvider } from "./dev-auth.js";
import { sendJson } from "./http-response.js";

export const handleLobbyJoinCodeRequest = async ({
  request,
  response,
  pathname,
  lobbyRegistry,
  authProvider,
  onJoined,
}: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly lobbyRegistry: CustomLobbyRegistry;
  readonly authProvider: AuthProvider;
  readonly onJoined: (lobby: CreatedCustomLobbyResponse) => void;
}): Promise<boolean> => {
  const route =
    /^\/api\/lobbies\/by-code\/(?<joinCode>[0-9a-zA-Z]+)\/join$/u.exec(
      pathname,
    );
  if (request.method !== "POST" || route === null) {
    return false;
  }

  const joinCode = decodeURIComponent(
    route.groups?.["joinCode"] ?? "",
  ).toLowerCase();
  const result = await lobbyRegistry.joinLobbyByCode(
    joinCode,
    authProvider.authenticate(request),
  );
  if (result === "lobbyNotFound") {
    sendJson(response, 404, { errors: [`Lobby code ${joinCode} not found.`] });
    return true;
  }
  if (result === "unauthenticated") {
    sendJson(response, 401, { errors: ["Account session is required."] });
    return true;
  }
  if (result === "full") {
    sendJson(response, 409, { errors: ["Lobby is full."] });
    return true;
  }
  onJoined(result);
  sendJson(response, 200, result);
  return true;
};
