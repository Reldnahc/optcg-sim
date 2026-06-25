import type { IncomingMessage, ServerResponse } from "node:http";

import { broadcastLobbyState } from "./dev-broadcasts.js";
import type { AuthProvider } from "./dev-auth.js";
import type { DevLobbySocketConnection } from "./dev-socket-connections.js";
import type { CustomLobbyRegistry } from "./custom-lobby-registry.js";
import { sendJson } from "./http-response.js";
import {
  handleCreateLobbyRequest,
  handleGetLobbyRequest,
} from "./lobby-basic-route.js";
import { handleLobbyJoinCodeRequest } from "./lobby-join-code-route.js";
import { handleLobbyLoadoutValidationRequest } from "./lobby-loadout-validation-route.js";
import { isRecord, readRequestJson } from "./request-json.js";
import type { SimHandoffVerifier } from "./sim-handoff.js";

export interface HandleLobbySetupHttpRequestOptions {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly lobbyRegistry: CustomLobbyRegistry;
  readonly lobbyConnections: Set<DevLobbySocketConnection>;
  readonly authProvider: AuthProvider;
  readonly simHandoffVerifier: SimHandoffVerifier;
  readonly allowRawDeckHashSubmissions: boolean;
}

export const handleLobbySetupHttpRequest = async ({
  request,
  response,
  pathname,
  lobbyRegistry,
  lobbyConnections,
  authProvider,
  simHandoffVerifier,
  allowRawDeckHashSubmissions,
}: HandleLobbySetupHttpRequestOptions): Promise<boolean> => {
  if (
    await handleCreateLobbyRequest({
      request,
      response,
      lobbyRegistry,
    })
  ) {
    return true;
  }
  if (
    await handleLobbyJoinCodeRequest({
      request,
      response,
      pathname,
      lobbyRegistry,
      authProvider,
      onJoined: (lobby) => {
        broadcastLobbyState(lobby, lobbyConnections);
      },
    })
  ) {
    return true;
  }
  if (
    await handleGetLobbyRequest({
      request,
      response,
      pathname,
      lobbyRegistry,
    })
  ) {
    return true;
  }
  const lobbyJoinRoute = /^\/api\/lobbies\/(?<lobbyId>[^/]+)\/join$/u.exec(
    pathname,
  );
  if (request.method === "POST" && lobbyJoinRoute !== null) {
    const lobbyId = decodeURIComponent(
      lobbyJoinRoute.groups?.["lobbyId"] ?? "",
    );
    const result = await lobbyRegistry.joinLobby(
      lobbyId,
      authProvider.authenticate(request),
    );
    if (result === "lobbyNotFound") {
      sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
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
    broadcastLobbyState(result, lobbyConnections);
    sendJson(response, 200, result);
    return true;
  }
  const lobbyDeckRoute = /^\/api\/lobbies\/(?<lobbyId>[^/]+)\/deck$/u.exec(
    pathname,
  );
  if (request.method === "POST" && lobbyDeckRoute !== null) {
    if (!allowRawDeckHashSubmissions) {
      sendJson(response, 403, {
        errors: ["Raw deck hash submissions are only available locally."],
      });
      return true;
    }
    const lobbyId = decodeURIComponent(
      lobbyDeckRoute.groups?.["lobbyId"] ?? "",
    );
    const body = await readRequestJson(request);
    const deckHash = isRecord(body) ? body["deckHash"] : undefined;
    const donDeckCount = isRecord(body) ? body["donDeckCount"] : undefined;
    if (typeof deckHash !== "string" || deckHash.trim().length === 0) {
      sendJson(response, 400, { errors: ["Deck hash is required."] });
      return true;
    }
    if (
      typeof donDeckCount !== "number" ||
      !Number.isInteger(donDeckCount) ||
      donDeckCount < 1 ||
      donDeckCount > 10
    ) {
      sendJson(response, 400, {
        errors: ["DON deck count must be an integer from 1 to 10."],
      });
      return true;
    }
    const result = await lobbyRegistry.submitDeck(
      lobbyId,
      authProvider.authenticate(request),
      deckHash.trim(),
      donDeckCount,
    );
    if (result === "lobbyNotFound") {
      sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
      return true;
    }
    if (result === "unauthenticated") {
      sendJson(response, 401, { errors: ["Account session is required."] });
      return true;
    }
    if (result === "seatNotFound") {
      sendJson(response, 403, {
        errors: ["Session token is not authorized for this lobby."],
      });
      return true;
    }
    if (result === "invalidDeck") {
      sendJson(response, 400, { errors: ["Deck hash is invalid."] });
      return true;
    }
    broadcastLobbyState(result, lobbyConnections);
    sendJson(response, 200, result);
    return true;
  }
  if (
    await handleLobbyLoadoutValidationRequest({
      request,
      response,
      pathname,
      lobbyRegistry,
      simHandoffVerifier,
    })
  ) {
    return true;
  }
  const lobbyLoadoutRoute =
    /^\/api\/lobbies\/(?<lobbyId>[^/]+)\/loadout$/u.exec(pathname);
  if (request.method === "POST" && lobbyLoadoutRoute !== null) {
    const lobbyId = decodeURIComponent(
      lobbyLoadoutRoute.groups?.["lobbyId"] ?? "",
    );
    const body = await readRequestJson(request);
    const handoffToken = isRecord(body) ? body["handoffToken"] : undefined;
    if (typeof handoffToken !== "string" || handoffToken.trim().length === 0) {
      sendJson(response, 400, { errors: ["Sim handoff token is required."] });
      return true;
    }
    let handoff;
    try {
      handoff = await simHandoffVerifier.verify(handoffToken.trim());
    } catch (error: unknown) {
      sendJson(response, 401, {
        errors: [
          error instanceof Error
            ? error.message
            : "Sim handoff verification failed.",
        ],
      });
      return true;
    }
    const result = await lobbyRegistry.submitVerifiedLoadout(lobbyId, handoff);
    if (result === "lobbyNotFound") {
      sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
      return true;
    }
    if (result === "seatNotFound") {
      sendJson(response, 403, {
        errors: ["Sim handoff token is not authorized for this lobby seat."],
      });
      return true;
    }
    if (result === "full") {
      sendJson(response, 409, { errors: ["Lobby is full."] });
      return true;
    }
    if (result === "invalidDeck") {
      sendJson(response, 400, { errors: ["Resolved loadout is invalid."] });
      return true;
    }
    broadcastLobbyState(result, lobbyConnections);
    sendJson(response, 200, result);
    return true;
  }
  return false;
};
