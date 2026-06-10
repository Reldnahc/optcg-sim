import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  CustomLobbyDeckValidationInput,
  CustomLobbyRegistry,
} from "./custom-lobby-registry.js";
import { sendJson } from "./http-response.js";
import { isRecord, readRequestJson } from "./request-json.js";
import type {
  SimHandoffBatchVerificationResult,
  SimHandoffVerifier,
} from "./sim-handoff.js";

interface HandleLobbyLoadoutValidationRequestOptions {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly lobbyRegistry: CustomLobbyRegistry;
  readonly simHandoffVerifier: SimHandoffVerifier;
}

export const handleLobbyLoadoutValidationRequest = async ({
  request,
  response,
  pathname,
  lobbyRegistry,
  simHandoffVerifier,
}: HandleLobbyLoadoutValidationRequestOptions): Promise<boolean> => {
  const route = /^\/api\/lobbies\/(?<lobbyId>[^/]+)\/loadouts\/validate$/u.exec(
    pathname,
  );
  if (request.method !== "POST" || route === null) {
    return await handleLobbyDeckValidationRequest({
      request,
      response,
      pathname,
      lobbyRegistry,
    });
  }

  const lobbyId = decodeURIComponent(route.groups?.["lobbyId"] ?? "");
  const body = await readRequestJson(request);
  const handoffTokens = isRecord(body) ? body["handoffTokens"] : undefined;
  if (
    !Array.isArray(handoffTokens) ||
    !handoffTokens.every((token) => typeof token === "string")
  ) {
    sendJson(response, 400, {
      errors: ["handoffTokens must be an array of strings."],
    });
    return true;
  }

  let verified: readonly SimHandoffBatchVerificationResult[];
  try {
    verified = await simHandoffVerifier.verifyBatch(handoffTokens);
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

  const result = await lobbyRegistry.validateLoadouts(lobbyId, verified);
  if (result === "lobbyNotFound") {
    sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
    return true;
  }
  sendJson(response, 200, result);
  return true;
};

const isDeckValidationInput = (
  value: unknown,
): value is CustomLobbyDeckValidationInput =>
  isRecord(value) &&
  typeof value["loadoutId"] === "string" &&
  typeof value["deckHash"] === "string" &&
  typeof value["donDeckCount"] === "number" &&
  Number.isInteger(value["donDeckCount"]);

const handleLobbyDeckValidationRequest = async ({
  request,
  response,
  pathname,
  lobbyRegistry,
}: Omit<
  HandleLobbyLoadoutValidationRequestOptions,
  "simHandoffVerifier"
>): Promise<boolean> => {
  const route = /^\/api\/lobbies\/(?<lobbyId>[^/]+)\/decks\/validate$/u.exec(
    pathname,
  );
  if (request.method !== "POST" || route === null) {
    return false;
  }

  const lobbyId = decodeURIComponent(route.groups?.["lobbyId"] ?? "");
  const body = await readRequestJson(request);
  const decks = isRecord(body) ? body["decks"] : undefined;
  if (!Array.isArray(decks) || !decks.every(isDeckValidationInput)) {
    sendJson(response, 400, {
      errors: [
        "decks must be an array of { loadoutId, deckHash, donDeckCount }.",
      ],
    });
    return true;
  }

  const result = await lobbyRegistry.validateDecks(lobbyId, decks);
  if (result === "lobbyNotFound") {
    sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
    return true;
  }
  sendJson(response, 200, result);
  return true;
};
