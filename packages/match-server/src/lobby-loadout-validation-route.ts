import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  CustomLobbyDeckValidationInput,
  CustomLobbyRegistry,
} from "./custom-lobby-registry.js";
import { sendJson } from "./http-response.js";
import { isRecord, readRequestJson } from "./request-json.js";
import {
  recordLobbyValidationTimingSpan,
  roundLobbyValidationTimingMs,
  writeLobbyValidationTimingLog,
  type LobbyValidationTimingSpan,
} from "./lobby-validation-timing-log.js";
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

  const startedAt = performance.now();
  const timingSpans: LobbyValidationTimingSpan[] = [];
  const lobbyId = decodeURIComponent(route.groups?.["lobbyId"] ?? "");
  const body = await recordLobbyValidationTimingSpan(
    timingSpans,
    "request-json",
    async () => await readRequestJson(request),
  );
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
    verified = await recordLobbyValidationTimingSpan(
      timingSpans,
      "handoff-verify-batch",
      async () => await simHandoffVerifier.verifyBatch(handoffTokens),
      { count: handoffTokens.length },
    );
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

  const result = await lobbyRegistry.validateLoadouts(
    lobbyId,
    verified,
    timingSpans,
  );
  if (result === "lobbyNotFound") {
    sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
    writeLobbyValidationTimingLog({
      route: "loadouts.validate",
      lobbyId,
      loadoutCount: handoffTokens.length,
      spans: timingSpans,
      totalMs: roundLobbyValidationTimingMs(performance.now() - startedAt),
    });
    return true;
  }
  sendJson(response, 200, result);
  writeLobbyValidationTimingLog({
    route: "loadouts.validate",
    lobbyId,
    loadoutCount: handoffTokens.length,
    spans: timingSpans,
    totalMs: roundLobbyValidationTimingMs(performance.now() - startedAt),
  });
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

  const startedAt = performance.now();
  const timingSpans: LobbyValidationTimingSpan[] = [];
  const lobbyId = decodeURIComponent(route.groups?.["lobbyId"] ?? "");
  const body = await recordLobbyValidationTimingSpan(
    timingSpans,
    "request-json",
    async () => await readRequestJson(request),
  );
  const decks = isRecord(body) ? body["decks"] : undefined;
  if (!Array.isArray(decks) || !decks.every(isDeckValidationInput)) {
    sendJson(response, 400, {
      errors: [
        "decks must be an array of { loadoutId, deckHash, donDeckCount }.",
      ],
    });
    return true;
  }

  const result = await lobbyRegistry.validateDecks(lobbyId, decks, timingSpans);
  if (result === "lobbyNotFound") {
    sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
    writeLobbyValidationTimingLog({
      route: "decks.validate",
      lobbyId,
      loadoutCount: decks.length,
      spans: timingSpans,
      totalMs: roundLobbyValidationTimingMs(performance.now() - startedAt),
    });
    return true;
  }
  sendJson(response, 200, result);
  writeLobbyValidationTimingLog({
    route: "decks.validate",
    lobbyId,
    loadoutCount: decks.length,
    spans: timingSpans,
    totalMs: roundLobbyValidationTimingMs(performance.now() - startedAt),
  });
  return true;
};
