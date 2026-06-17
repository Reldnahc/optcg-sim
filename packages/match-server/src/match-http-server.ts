import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import type { MatchId, PlayerId } from "@optcg/types";

import {
  createCustomLobbyRegistry,
  type CustomLobbyRegistry,
} from "./custom-lobby-registry.js";
import type { AuthContext, AuthProvider } from "./dev-auth.js";
import { createDevAuthProvider, parseDevSessionToken } from "./dev-auth.js";
import {
  createPoneglyphSimHandoffVerifier,
  type SimHandoffVerifier,
} from "./sim-handoff.js";
import { isDevSocketEnvelope } from "./dev-socket-envelope.js";
import { clientActionEnvelopeFromSocketPayload } from "./dev-socket-action-envelope.js";
import {
  createLocalDevMatchRegistry,
  type LocalDevMatchRegistry,
} from "./dev-local-match-registry.js";
import {
  parseWebSocketFrames,
  websocketAccept,
} from "./dev-websocket-protocol.js";
import {
  clearConnectionHeartbeat,
  clearConnectionIdleTimeout,
  registerConnectionLifecycle,
  resetConnectionIdleTimeout,
  sendSocketJson,
  startConnectionHeartbeat,
  type DevLobbySocketConnection,
  type DevSocketConnection,
} from "./dev-socket-connections.js";
import { connectedPlayerIdsForMatch } from "./dev-match-connection-state.js";
import { advanceMatchTimersAndBroadcast } from "./dev-match-timer-broadcast.js";
import {
  applyBrowserCorsHeaders,
  handleBrowserCorsPreflight,
} from "./browser-cors.js";
import { createSocketActionTiming } from "./action-timing-log.js";
import { sendJson, sendMatchNotFound, sendText } from "./http-response.js";
import { serveStaticAssetsOrNotFound } from "./static-assets.js";
import { handleCreateMatchRequest } from "./match-create-route.js";
import {
  handleCreateLobbyRequest,
  handleGetLobbyRequest,
} from "./lobby-basic-route.js";
import { handleLobbyLoadoutValidationRequest } from "./lobby-loadout-validation-route.js";
import { handleLobbyJoinCodeRequest } from "./lobby-join-code-route.js";
import { handleRematchRequest } from "./match-rematch-route.js";
import { handleResetRequest } from "./match-reset-route.js";
import { handleReplayRequest } from "./replay-route.js";
import { isRecord, readRequestJson } from "./request-json.js";
import { playerStatePayload } from "./match-state-payload.js";
import {
  broadcastLobbyError,
  broadcastLobbyState,
  broadcastMatchState,
  broadcastMatchTimers,
  broadcastRematchRequest,
  broadcastSessionTransition,
} from "./dev-broadcasts.js";
import {
  createDefaultMatchSetupFactory,
  defaultRematchLobbyDisconnectGraceMs,
  defaultMatchTimerTickMs,
  defaultSocketIdleTimeoutMs,
  resolveAllowRawDeckHashSubmissions,
  resolveRawDeckVerificationMode,
  resolveCompletedMatchRepository,
  resolveReplayRepository,
  resolveMatchTimerPolicy,
  type CreateMatchHttpServerOptions,
} from "./match-http-server-options.js";
import { createRedisClientForLobbyStore } from "./lobby-store.js";
import { resolveRedisConfig } from "./redis-config.js";
import { createRedisMatchPersistence } from "./redis-match-persistence.js";
import type { CompletedMatchReplayRepository } from "./postgres-completed-match.js";
import type { MatchPersistence } from "./session-types.js";

export { websocketTextFrame } from "./dev-websocket-protocol.js";
export type { CreateMatchHttpServerOptions } from "./match-http-server-options.js";

interface FirstPlayerChoiceRequest {
  playerId?: unknown;
  choice?: unknown;
}

const resolveActiveMatchPersistence = async (
  options: CreateMatchHttpServerOptions,
): Promise<MatchPersistence | undefined> => {
  if (options.matchPersistence !== undefined) {
    return options.matchPersistence;
  }
  const redisConfig = resolveRedisConfig({
    redisUrl: options.redisUrl,
    redisMode: options.redisMode,
  });
  if (redisConfig.redisUrl === undefined) {
    return undefined;
  }
  return createRedisMatchPersistence(
    await createRedisClientForLobbyStore(redisConfig.redisUrl),
  );
};

export interface MatchHttpServer {
  listen: (port: number, host?: string) => Promise<void>;
  close: () => Promise<void>;
  url: () => string;
}

const handleApiRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  registry: LocalDevMatchRegistry,
  lobbyRegistry: CustomLobbyRegistry,
  matchConnections: Set<DevSocketConnection>,
  lobbyConnections: Set<DevLobbySocketConnection>,
  authProvider: AuthProvider,
  simHandoffVerifier: SimHandoffVerifier,
  replayRepository: CompletedMatchReplayRepository | undefined,
  allowTemplateMatches: boolean,
  allowRawDeckHashSubmissions: boolean,
): Promise<void> => {
  const url = request.url ?? "/";
  const pathname = new URL(url, "http://localhost").pathname;
  const matchRoute =
    /^\/api\/matches\/(?<matchId>[^/]+)\/(?<resource>[^/]+)$/u.exec(pathname);
  if (
    await handleReplayRequest({
      request,
      response,
      pathname,
      replayRepository,
    })
  ) {
    return;
  }
  if (request.method === "POST" && pathname === "/api/matches") {
    await handleCreateMatchRequest(
      response,
      registry.createMatch,
      allowTemplateMatches,
    );
    return;
  }
  if (
    await handleCreateLobbyRequest({
      request,
      response,
      lobbyRegistry,
    })
  ) {
    return;
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
    return;
  }
  if (
    await handleGetLobbyRequest({
      request,
      response,
      pathname,
      lobbyRegistry,
    })
  ) {
    return;
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
      return;
    }
    if (result === "unauthenticated") {
      sendJson(response, 401, { errors: ["Account session is required."] });
      return;
    }
    if (result === "full") {
      sendJson(response, 409, { errors: ["Lobby is full."] });
      return;
    }
    broadcastLobbyState(result, lobbyConnections);
    sendJson(response, 200, result);
    return;
  }
  const lobbyDeckRoute = /^\/api\/lobbies\/(?<lobbyId>[^/]+)\/deck$/u.exec(
    pathname,
  );
  if (request.method === "POST" && lobbyDeckRoute !== null) {
    if (!allowRawDeckHashSubmissions) {
      sendJson(response, 403, {
        errors: ["Raw deck hash submissions are only available locally."],
      });
      return;
    }
    const lobbyId = decodeURIComponent(
      lobbyDeckRoute.groups?.["lobbyId"] ?? "",
    );
    const body = await readRequestJson(request);
    const deckHash = isRecord(body) ? body["deckHash"] : undefined;
    const donDeckCount = isRecord(body) ? body["donDeckCount"] : undefined;
    if (typeof deckHash !== "string" || deckHash.trim().length === 0) {
      sendJson(response, 400, { errors: ["Deck hash is required."] });
      return;
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
      return;
    }
    const result = await lobbyRegistry.submitDeck(
      lobbyId,
      authProvider.authenticate(request),
      deckHash.trim(),
      donDeckCount,
    );
    if (result === "lobbyNotFound") {
      sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
      return;
    }
    if (result === "unauthenticated") {
      sendJson(response, 401, { errors: ["Account session is required."] });
      return;
    }
    if (result === "seatNotFound") {
      sendJson(response, 403, {
        errors: ["Session token is not authorized for this lobby."],
      });
      return;
    }
    if (result === "invalidDeck") {
      sendJson(response, 400, { errors: ["Deck hash is invalid."] });
      return;
    }
    broadcastLobbyState(result, lobbyConnections);
    sendJson(response, 200, result);
    return;
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
    return;
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
      return;
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
      return;
    }
    const result = await lobbyRegistry.submitVerifiedLoadout(lobbyId, handoff);
    if (result === "lobbyNotFound") {
      sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
      return;
    }
    if (result === "seatNotFound") {
      sendJson(response, 403, {
        errors: ["Sim handoff token is not authorized for this lobby seat."],
      });
      return;
    }
    if (result === "full") {
      sendJson(response, 409, { errors: ["Lobby is full."] });
      return;
    }
    if (result === "invalidDeck") {
      sendJson(response, 400, { errors: ["Resolved loadout is invalid."] });
      return;
    }
    broadcastLobbyState(result, lobbyConnections);
    sendJson(response, 200, result);
    return;
  }
  const seatClaimRoute =
    /^\/api\/matches\/(?<matchId>[^/]+)\/seats\/(?<playerId>[^/]+)\/claim$/u.exec(
      pathname,
    );
  const accountSeatClaimRoute =
    /^\/api\/matches\/(?<matchId>[^/]+)\/seat\/claim$/u.exec(pathname);
  if (request.method === "POST" && accountSeatClaimRoute !== null) {
    const matchId = decodeURIComponent(
      accountSeatClaimRoute.groups?.["matchId"] ?? "",
    ) as MatchId;
    const result = await registry.claimSeatForAuth(
      matchId,
      authProvider.authenticate(request),
    );
    if (result === "matchNotFound") {
      sendMatchNotFound(response, matchId);
      return;
    }
    if (result === "unauthenticated") {
      sendJson(response, 401, { errors: ["Account session is required."] });
      return;
    }
    if (result === "seatNotFound") {
      sendJson(response, 403, {
        errors: ["Account session is not authorized for this match."],
      });
      return;
    }
    sendJson(response, 200, result);
    return;
  }
  if (request.method === "POST" && seatClaimRoute !== null) {
    const matchId = decodeURIComponent(
      seatClaimRoute.groups?.["matchId"] ?? "",
    ) as MatchId;
    const playerId = decodeURIComponent(
      seatClaimRoute.groups?.["playerId"] ?? "",
    ) as PlayerId;
    const result = await registry.claimSeat(
      matchId,
      playerId,
      authProvider.authenticate(request),
    );
    if (result === "matchNotFound") {
      sendMatchNotFound(response, matchId);
      return;
    }
    if (result === "seatNotFound") {
      sendJson(response, 404, {
        errors: [`Seat ${String(playerId)} not found.`],
      });
      return;
    }
    if (result === "unauthenticated") {
      sendJson(response, 401, { errors: ["Account session is required."] });
      return;
    }
    if (result === "claimed") {
      sendJson(response, 409, {
        errors: [`Seat ${String(playerId)} is already claimed.`],
      });
      return;
    }
    sendJson(response, 200, result);
    return;
  }
  if (matchRoute !== null) {
    const matchId = decodeURIComponent(matchRoute.groups?.["matchId"] ?? "");
    const resource = matchRoute.groups?.["resource"];
    if (request.method === "POST" && resource === "first-player-choice") {
      let body: unknown;
      try {
        body = await readRequestJson(request);
      } catch {
        sendJson(response, 400, { errors: ["Request body must be JSON."] });
        return;
      }
      const choiceRequest: FirstPlayerChoiceRequest = isRecord(body)
        ? body
        : {};
      const playerId = choiceRequest.playerId;
      const choice = choiceRequest.choice;
      if (
        typeof playerId !== "string" ||
        (choice !== "goFirst" && choice !== "goSecond")
      ) {
        sendJson(response, 400, {
          errors: ["First-player choice requires playerId and choice."],
        });
        return;
      }
      const result = await registry.chooseFirstPlayer(
        matchId as MatchId,
        playerId as PlayerId,
        choice,
      );
      if (result === "matchNotFound") {
        sendMatchNotFound(response, matchId);
        return;
      }
      if (result === "alreadyStarted") {
        sendJson(response, 409, {
          errors: ["First-player choice is already resolved."],
        });
        return;
      }
      if (result === "notChooser") {
        sendJson(response, 403, {
          errors: ["Only the selected first-player chooser can answer."],
        });
        return;
      }
      broadcastMatchState(matchId as MatchId, registry, matchConnections);
      sendJson(response, 200, result);
      return;
    }
    if (request.method === "POST" && resource === "rematch") {
      await handleRematchRequest({
        request,
        response,
        matchId: matchId as MatchId,
        lobbyRegistry,
        auth: authProvider.authenticate(request),
        onPending: (requestedBy) => {
          broadcastRematchRequest(
            matchId as MatchId,
            requestedBy,
            matchConnections,
          );
        },
        onCreated: (created) => {
          broadcastSessionTransition(
            matchId as MatchId,
            created,
            matchConnections,
          );
          broadcastLobbyState(created, lobbyConnections);
        },
      });
      return;
    }
    const match = registry.getMatch(matchId as MatchId);
    if (match === undefined) {
      if (
        resource === "state" &&
        registry.getFirstPlayerChoice(matchId as MatchId) !== undefined
      ) {
        sendJson(response, 409, {
          errors: ["First-player setup is not resolved."],
          firstPlayerChoice: registry.getFirstPlayerChoice(matchId as MatchId),
        });
        return;
      }
      sendMatchNotFound(response, matchId);
      return;
    }
    sendJson(response, 404, { errors: ["API route not found."] });
    return;
  }
  if (
    await handleResetRequest({
      request,
      response,
      pathname,
      registry,
    })
  ) {
    return;
  }
  sendJson(response, 404, { errors: ["API route not found."] });
};

const handleNotFoundRequest = (response: ServerResponse): Promise<void> => {
  sendText(response, 404, "text/plain; charset=utf-8", "Not found");
  return Promise.resolve();
};

const playerSetupPayload = (
  matchId: MatchId,
  firstPlayerChoice: unknown,
  connection: DevSocketConnection,
): Record<string, unknown> => ({
  type: "setupSync",
  matchId,
  serverSeq: ++connection.serverSeq,
  firstPlayerChoice,
});

const handleWebSocketUpgrade = async (
  request: IncomingMessage,
  socket: Duplex,
  registry: LocalDevMatchRegistry,
  lobbyRegistry: CustomLobbyRegistry,
  authProvider: AuthProvider,
  connections: Set<DevSocketConnection>,
  lobbyConnections: Set<DevLobbySocketConnection>,
  socketIdleTimeoutMs: number,
  rematchLobbyDisconnectGraceMs: number,
): Promise<void> => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const lobbyRoute = /^\/api\/lobbies\/(?<lobbyId>[^/]+)\/ws$/u.exec(
    url.pathname,
  );
  if (lobbyRoute !== null) {
    const lobbyId = decodeURIComponent(lobbyRoute.groups?.["lobbyId"] ?? "");
    const playerId = (url.searchParams.get("playerId") ?? "") as PlayerId;
    const sessionToken = url.searchParams.get("sessionToken") ?? "";
    const key = request.headers["sec-websocket-key"];
    const lobby = await lobbyRegistry.getLobby(lobbyId);
    const subject = parseDevSessionToken(sessionToken);
    const authorization = await lobbyRegistry.authorizeSeat(
      subject === undefined ? undefined : { subject },
      lobbyId,
      playerId,
    );
    if (
      lobby === undefined ||
      typeof key !== "string" ||
      key.length === 0 ||
      playerId.length === 0 ||
      authorization !== "authorized"
    ) {
      socket.end(
        authorization === "unauthenticated"
          ? "HTTP/1.1 401 Unauthorized\r\n\r\n"
          : authorization === "forbidden"
            ? "HTTP/1.1 403 Forbidden\r\n\r\n"
            : "HTTP/1.1 400 Bad Request\r\n\r\n",
      );
      return;
    }

    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${websocketAccept(key)}`,
        "\r\n",
      ].join("\r\n"),
    );

    const connection: DevLobbySocketConnection = {
      lobbyId,
      playerId,
      socket,
      serverSeq: 0,
    };
    lobbyConnections.add(connection);
    startConnectionHeartbeat(connection, "lobbyHeartbeat");
    resetConnectionIdleTimeout(connection, socketIdleTimeoutMs);
    registerConnectionLifecycle(connection, () => {
      lobbyConnections.delete(connection);
      const cancelTimer = setTimeout(() => {
        const reconnected = [...lobbyConnections].some(
          (candidate) =>
            candidate.lobbyId === lobbyId && candidate.playerId === playerId,
        );
        if (reconnected) {
          return;
        }
        void lobbyRegistry.cancelRematchLobby(lobbyId).then((cancelled) => {
          if (!cancelled) {
            return;
          }
          broadcastLobbyError(
            lobbyId,
            "Rematch canceled because a player disconnected from the lobby.",
            lobbyConnections,
          );
        });
      }, rematchLobbyDisconnectGraceMs);
      cancelTimer.unref();
    });
    sendSocketJson(connection, {
      type: "lobbySync",
      lobbyId: connection.lobbyId,
      serverSeq: ++connection.serverSeq,
      lobby,
    });

    let buffered: Buffer = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      resetConnectionIdleTimeout(connection, socketIdleTimeoutMs);
      buffered = Buffer.concat([buffered, chunk]);
      const parsed = parseWebSocketFrames(buffered);
      buffered = parsed.remaining;
      if (parsed.close) {
        socket.end();
      }
    });
    return;
  }

  const route = /^\/api\/matches\/(?<matchId>[^/]+)\/ws$/u.exec(url.pathname);
  if (route === null) {
    socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
    return;
  }
  const matchId = decodeURIComponent(
    route.groups?.["matchId"] ?? "",
  ) as MatchId;
  const playerId = (url.searchParams.get("playerId") ?? "") as PlayerId;
  const sessionToken = url.searchParams.get("sessionToken") ?? "";
  const key = request.headers["sec-websocket-key"];
  const match = registry.getMatch(matchId);
  const firstPlayerChoice = registry.getFirstPlayerChoice(matchId);
  if (
    (match === undefined && firstPlayerChoice === undefined) ||
    typeof key !== "string" ||
    key.length === 0 ||
    playerId.length === 0 ||
    sessionToken.length === 0
  ) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }
  void authProvider;
  const subject = parseDevSessionToken(sessionToken);
  const auth: AuthContext | undefined =
    subject === undefined ? undefined : { subject };
  if (registry.authorizeSeat(auth, matchId, playerId) !== "authorized") {
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${websocketAccept(key)}`,
      "\r\n",
    ].join("\r\n"),
  );

  const connection: DevSocketConnection = {
    matchId,
    playerId,
    socket,
    serverSeq: 0,
  };
  connections.add(connection);
  startConnectionHeartbeat(connection, "heartbeat");
  resetConnectionIdleTimeout(connection, socketIdleTimeoutMs);
  registry.advanceTimers({
    elapsedMs: 0,
    connectedPlayerIds: (id) => connectedPlayerIdsForMatch(id, connections),
    matchIds: [matchId],
  });
  registerConnectionLifecycle(connection, () => {
    connections.delete(connection);
    lobbyRegistry.cancelRematchConsensusForMatch(matchId);
    registry.advanceTimers({
      elapsedMs: 0,
      connectedPlayerIds: (id) => connectedPlayerIdsForMatch(id, connections),
      matchIds: [matchId],
    });
    broadcastMatchState(matchId, registry, connections);
  });
  if (match === undefined) {
    sendSocketJson(
      connection,
      playerSetupPayload(matchId, firstPlayerChoice, connection),
    );
  } else {
    sendSocketJson(
      connection,
      playerStatePayload(
        match,
        connection,
        connections,
        registry.virtualConnectedPlayerIds(matchId),
      ),
    );
    broadcastMatchState(matchId, registry, connections, {
      except: connection,
    });
  }

  let buffered: Buffer = Buffer.alloc(0);
  const handleMatchSocketData = async (chunk: Buffer): Promise<void> => {
    resetConnectionIdleTimeout(connection, socketIdleTimeoutMs);
    buffered = Buffer.concat([buffered, chunk]);
    const parsed = parseWebSocketFrames(buffered);
    buffered = parsed.remaining;
    if (parsed.close) {
      socket.end();
      return;
    }
    for (const raw of parsed.messages) {
      const timing = createSocketActionTiming(raw);
      let payload: unknown;
      try {
        payload = JSON.parse(raw) as unknown;
      } catch {
        sendSocketJson(connection, {
          type: "matchError",
          matchId,
          serverSeq: ++connection.serverSeq,
          message: "WebSocket message must be JSON.",
        });
        continue;
      }
      if (
        !isDevSocketEnvelope(payload) ||
        payload.matchId !== matchId ||
        payload.playerId !== playerId
      ) {
        sendSocketJson(connection, {
          type: "matchError",
          matchId,
          serverSeq: ++connection.serverSeq,
          message: "Invalid WebSocket action envelope.",
        });
        continue;
      }
      const envelope = clientActionEnvelopeFromSocketPayload(payload);
      const result = await timing.apply(() => registry.applyEnvelope(envelope));
      if (result === "matchNotFound") {
        timing.record(() => {
          sendSocketJson(connection, {
            type: "matchError",
            matchId,
            serverSeq: ++connection.serverSeq,
            message: "Match session is not active on this server.",
          });
        });
        continue;
      }
      const errors = [...result.errors];
      timing.record(() => {
        sendSocketJson(connection, {
          type: "actionResult",
          matchId,
          clientActionId: payload.clientActionId,
          accepted: result.accepted,
          stateSeq: result.stateSeq,
          ...(result.actionSeq === undefined
            ? {}
            : { actionSeq: result.actionSeq }),
          ...(result.reason === undefined ? {} : { reason: result.reason }),
          errors,
        });
      });
      if (result.accepted) {
        timing.record(() => {
          broadcastMatchState(matchId, registry, connections);
        });
      }
      timing.write({ matchId, playerId, payload, envelope, result });
    }
  };
  socket.on("data", (chunk: Buffer) => {
    void handleMatchSocketData(chunk);
  });
};

export const createMatchHttpServer = async (
  options: CreateMatchHttpServerOptions = {},
): Promise<MatchHttpServer> => {
  const createDefaultSetup = createDefaultMatchSetupFactory(options);
  const socketConnections = new Set<DevSocketConnection>();
  const lobbySocketConnections = new Set<DevLobbySocketConnection>();
  const matchPersistence = await resolveActiveMatchPersistence(options);
  const registry = await createLocalDevMatchRegistry(
    createDefaultSetup,
    options.setup,
    {
      ...(options.createDefaultMatch === undefined
        ? {}
        : { createDefaultMatch: options.createDefaultMatch }),
      ...(() => {
        const completedMatchRepository =
          resolveCompletedMatchRepository(options);
        return completedMatchRepository === undefined
          ? {}
          : { completedMatchRepository };
      })(),
      ...(matchPersistence === undefined ? {} : { matchPersistence }),
      includeActionSnapshots: false,
      matchTimerPolicy: resolveMatchTimerPolicy(options),
      onBotActionAccepted(matchId) {
        broadcastMatchState(matchId, registry, socketConnections);
      },
    },
  );
  const allowRawDeckHashSubmissions =
    resolveAllowRawDeckHashSubmissions(options);
  const lobbyRegistry = await createCustomLobbyRegistry(registry, {
    ...options,
    rawDeckVerificationMode: resolveRawDeckVerificationMode(
      options,
      allowRawDeckHashSubmissions,
    ),
  });
  const authProvider = createDevAuthProvider();
  const socketIdleTimeoutMs =
    options.socketIdleTimeoutMs ?? defaultSocketIdleTimeoutMs;
  const rematchLobbyDisconnectGraceMs =
    options.rematchLobbyDisconnectGraceMs ??
    defaultRematchLobbyDisconnectGraceMs;
  const matchTimerTickMs = options.matchTimerTickMs ?? defaultMatchTimerTickMs;
  const allowedBrowserOrigins = options.allowedBrowserOrigins ?? [];
  const allowTemplateMatches = options.allowTemplateMatches ?? true;
  const staticAssetsDirectory = options.staticAssetsDirectory;
  const simHandoffVerifier =
    options.simHandoffVerifier ??
    createPoneglyphSimHandoffVerifier({
      ...(options.authBaseUrl === undefined
        ? {}
        : { authBaseUrl: options.authBaseUrl }),
    });
  const replayRepository = resolveReplayRepository(options);
  let lastMatchTimerTickMs = Date.now();
  const matchTimerInterval = setInterval(() => {
    const now = Date.now();
    const elapsedMs = Math.max(0, now - lastMatchTimerTickMs);
    lastMatchTimerTickMs = now;
    advanceMatchTimersAndBroadcast(
      registry,
      socketConnections,
      elapsedMs,
      (matchId, sync) => {
        if (sync === "timers") {
          broadcastMatchTimers(matchId, registry, socketConnections);
          return;
        }
        broadcastMatchState(matchId, registry, socketConnections);
      },
    );
  }, matchTimerTickMs);
  matchTimerInterval.unref();
  const server = createServer((request, response) => {
    applyBrowserCorsHeaders(request, response, allowedBrowserOrigins);
    if (
      handleBrowserCorsPreflight(
        request,
        response,
        allowedBrowserOrigins,
        sendJson,
      )
    ) {
      return;
    }
    const url = request.url ?? "/";
    const pathname = new URL(url, "http://localhost").pathname;
    if (request.method === "GET" && pathname === "/health") {
      sendJson(response, 200, { data: { ok: true } });
      return;
    }
    const operation = url.startsWith("/api/")
      ? handleApiRequest(
          request,
          response,
          registry,
          lobbyRegistry,
          socketConnections,
          lobbySocketConnections,
          authProvider,
          simHandoffVerifier,
          replayRepository,
          allowTemplateMatches,
          allowRawDeckHashSubmissions,
        )
      : serveStaticAssetsOrNotFound(
          request,
          response,
          staticAssetsDirectory,
          () => handleNotFoundRequest(response),
        );
    operation.catch((error: unknown) => {
      sendJson(response, 500, {
        errors: [error instanceof Error ? error.message : String(error)],
      });
    });
  });
  server.on("upgrade", (request, socket) => {
    handleWebSocketUpgrade(
      request,
      socket,
      registry,
      lobbyRegistry,
      authProvider,
      socketConnections,
      lobbySocketConnections,
      socketIdleTimeoutMs,
      rematchLobbyDisconnectGraceMs,
    ).catch(() => {
      socket.end("HTTP/1.1 500 Internal Server Error\r\n\r\n");
    });
  });

  return {
    listen: async (port: number, host = "127.0.0.1") => {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },
    close: async () => {
      clearInterval(matchTimerInterval);
      for (const connection of socketConnections) {
        clearConnectionHeartbeat(connection);
        clearConnectionIdleTimeout(connection);
        connection.socket.destroy();
      }
      socketConnections.clear();
      for (const connection of lobbySocketConnections) {
        clearConnectionHeartbeat(connection);
        clearConnectionIdleTimeout(connection);
        connection.socket.destroy();
      }
      lobbySocketConnections.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
            return;
          }
          reject(error);
        });
      });
    },
    url: () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        throw new Error("Dev HTTP server is not listening.");
      }
      const { address: host, port } = address;
      return `http://${host}:${String(port)}`;
    },
  };
};
