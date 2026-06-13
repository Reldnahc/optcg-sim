import type { IncomingMessage, ServerResponse } from "node:http";

import type { CustomLobbyRegistry } from "./custom-lobby-registry.js";
import type { CustomLobbySettings } from "./lobby-store.js";
import { sendJson } from "./http-response.js";
import { isRecord, readRequestJson } from "./request-json.js";

interface CreateLobbyRequest {
  settings?: unknown;
}

const parseCreateLobbySettings = (
  body: unknown,
): Partial<CustomLobbySettings> | "invalid" => {
  const requestBody: CreateLobbyRequest = isRecord(body) ? body : {};
  if (requestBody.settings === undefined) {
    return {};
  }
  if (!isRecord(requestBody.settings)) {
    return "invalid";
  }
  const formatId = requestBody.settings["formatId"];
  if (typeof formatId !== "string" || formatId.trim().length === 0) {
    return "invalid";
  }
  return {
    formatId: formatId.trim(),
    ...(requestBody.settings["timerDisabled"] === true
      ? { timerDisabled: true }
      : {}),
  };
};

export const handleCreateLobbyRequest = async ({
  request,
  response,
  lobbyRegistry,
}: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly lobbyRegistry: CustomLobbyRegistry;
}): Promise<boolean> => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (request.method !== "POST" || pathname !== "/api/lobbies") {
    return false;
  }
  const settings = parseCreateLobbySettings(await readRequestJson(request));
  if (settings === "invalid") {
    sendJson(response, 400, {
      errors: ["Lobby format id must be a non-empty string."],
    });
    return true;
  }
  sendJson(response, 201, await lobbyRegistry.createLobby(settings));
  return true;
};

export const handleGetLobbyRequest = async ({
  request,
  response,
  pathname,
  lobbyRegistry,
}: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly lobbyRegistry: CustomLobbyRegistry;
}): Promise<boolean> => {
  const route = /^\/api\/lobbies\/(?<lobbyId>[^/]+)$/u.exec(pathname);
  if (route === null) {
    return false;
  }
  const lobbyId = decodeURIComponent(route.groups?.["lobbyId"] ?? "");
  const lobby = await lobbyRegistry.getLobby(lobbyId);
  if (lobby === undefined) {
    sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
    return true;
  }
  if (request.method === "GET") {
    sendJson(response, 200, lobby);
    return true;
  }
  sendJson(response, 404, { errors: ["API route not found."] });
  return true;
};
