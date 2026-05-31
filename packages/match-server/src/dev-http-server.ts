import { createHash } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import type { MatchId, PlayerId } from "@optcg/types";

import {
  createPremadeDevMatchSetup,
  getLocalDevCardCatalogForPlayer,
  getLocalDevCardCatalog,
  getLocalDevSnapshotForPlayer,
  getLocalDevSnapshot,
  isDevMatchSetup,
  type CreatePremadeDevMatchSetupOptions,
  type LocalDevMatch,
  type createLocalDevMatch,
} from "./local-match.js";
import type { AuthContext } from "./dev-auth.js";
import { isDevSocketEnvelope } from "./dev-socket-envelope.js";
import { clientActionEnvelopeFromSocketPayload } from "./dev-socket-action-envelope.js";
import {
  createLocalDevMatchRegistry,
  type LocalDevMatchRegistry,
} from "./dev-local-match-registry.js";

interface DevResetRequest {
  setup?: unknown;
}

interface FirstPlayerChoiceRequest {
  playerId?: unknown;
  choice?: unknown;
}

interface CreatedDevLobbyResponse {
  lobbyId: string;
  seats: Record<string, { playerId: PlayerId; claimed: boolean }>;
  matchId?: MatchId;
}

interface AuthProvider {
  authenticate: (request: IncomingMessage) => AuthContext | undefined;
}

interface LocalDevLobby {
  lobbyId: string;
  seats: Record<string, { playerId: PlayerId; claimed: boolean }>;
  matchId?: MatchId;
}

interface LocalDevLobbyRegistry {
  createLobby: () => CreatedDevLobbyResponse;
  claimSeat: (
    lobbyId: string,
    playerId: PlayerId,
  ) => Promise<CreatedDevLobbyResponse | "lobbyNotFound" | "seatNotFound">;
  getLobby: (lobbyId: string) => CreatedDevLobbyResponse | undefined;
}

export interface DevHttpServer {
  listen: (port: number, host?: string) => Promise<void>;
  close: () => Promise<void>;
  url: () => string;
}

export interface CreateDevHttpServerOptions extends CreatePremadeDevMatchSetupOptions {
  readonly setup?: Parameters<typeof createLocalDevMatch>[0];
}

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
};

const sendText = (
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: string,
): void => {
  response.writeHead(statusCode, { "content-type": contentType });
  response.end(body);
};

const readRequestJson = async (request: IncomingMessage): Promise<unknown> =>
  await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw.trim() === "") {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as unknown);
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    request.on("error", reject);
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const matchNotFound = (response: ServerResponse, matchId: string): void => {
  sendJson(response, 404, { errors: [`Match ${matchId} not found.`] });
};

const createDevAuthProvider = (): AuthProvider => ({
  authenticate: (request) => {
    const token = request.headers["x-optcg-session-token"];
    if (typeof token !== "string" || token.length === 0) {
      return undefined;
    }
    return {
      subject: { type: "anonymousDev", devSessionId: token },
    };
  },
});

const createLobbySeats = (): LocalDevLobby["seats"] => ({
  p1: { playerId: p1, claimed: false },
  p2: { playerId: p2, claimed: false },
});

const lobbyResponse = (lobby: LocalDevLobby): CreatedDevLobbyResponse => ({
  lobbyId: lobby.lobbyId,
  seats: Object.fromEntries(
    Object.entries(lobby.seats).map(([key, seat]) => [
      key,
      { playerId: seat.playerId, claimed: seat.claimed },
    ]),
  ),
  ...(lobby.matchId === undefined ? {} : { matchId: lobby.matchId }),
});

const createLocalDevLobbyRegistry = (
  matchRegistry: LocalDevMatchRegistry,
): LocalDevLobbyRegistry => {
  let nextLobbyNumber = 1;
  const lobbies = new Map<string, LocalDevLobby>();

  const ensureMatchWhenReady = async (lobby: LocalDevLobby): Promise<void> => {
    if (
      lobby.matchId !== undefined ||
      !Object.values(lobby.seats).every((seat) => seat.claimed)
    ) {
      return;
    }
    const created = await matchRegistry.createMatch();
    lobby.matchId = created.matchId;
  };

  return {
    createLobby() {
      const lobby: LocalDevLobby = {
        lobbyId: `dev-local-lobby-${String(nextLobbyNumber++)}`,
        seats: createLobbySeats(),
      };
      lobbies.set(lobby.lobbyId, lobby);
      return lobbyResponse(lobby);
    },
    async claimSeat(lobbyId, playerId) {
      const lobby = lobbies.get(lobbyId);
      if (lobby === undefined) {
        return "lobbyNotFound";
      }
      const seat = lobby.seats[String(playerId)];
      if (seat === undefined) {
        return "seatNotFound";
      }
      seat.claimed = true;
      await ensureMatchWhenReady(lobby);
      return lobbyResponse(lobby);
    },
    getLobby(lobbyId) {
      const lobby = lobbies.get(lobbyId);
      return lobby === undefined ? undefined : lobbyResponse(lobby);
    },
  };
};

const handleApiRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  registry: LocalDevMatchRegistry,
  lobbyRegistry: LocalDevLobbyRegistry,
  lobbyConnections: Set<DevLobbySocketConnection>,
  authProvider: AuthProvider,
): Promise<void> => {
  const url = request.url ?? "/";
  const pathname = new URL(url, "http://localhost").pathname;
  const defaultMatch = registry.getMatch(registry.defaultMatchId);
  if (defaultMatch === undefined) {
    throw new Error("Default dev match is missing.");
  }
  const matchRoute =
    /^\/api\/matches\/(?<matchId>[^/]+)\/(?<resource>[^/]+)$/u.exec(pathname);
  if (request.method === "POST" && pathname === "/api/matches") {
    sendJson(response, 201, await registry.createMatch());
    return;
  }
  if (request.method === "POST" && pathname === "/api/lobbies") {
    sendJson(response, 201, lobbyRegistry.createLobby());
    return;
  }
  const lobbyRoute = /^\/api\/lobbies\/(?<lobbyId>[^/]+)$/u.exec(pathname);
  if (lobbyRoute !== null) {
    const lobbyId = decodeURIComponent(lobbyRoute.groups?.["lobbyId"] ?? "");
    const lobby = lobbyRegistry.getLobby(lobbyId);
    if (lobby === undefined) {
      sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
      return;
    }
    if (request.method === "GET") {
      sendJson(response, 200, lobby);
      return;
    }
    sendJson(response, 404, { errors: ["API route not found."] });
    return;
  }
  const lobbySeatClaimRoute =
    /^\/api\/lobbies\/(?<lobbyId>[^/]+)\/seats\/(?<playerId>[^/]+)\/claim$/u.exec(
      pathname,
    );
  if (request.method === "POST" && lobbySeatClaimRoute !== null) {
    const lobbyId = decodeURIComponent(
      lobbySeatClaimRoute.groups?.["lobbyId"] ?? "",
    );
    const playerId = decodeURIComponent(
      lobbySeatClaimRoute.groups?.["playerId"] ?? "",
    ) as PlayerId;
    const result = await lobbyRegistry.claimSeat(lobbyId, playerId);
    if (result === "lobbyNotFound") {
      sendJson(response, 404, { errors: [`Lobby ${lobbyId} not found.`] });
      return;
    }
    if (result === "seatNotFound") {
      sendJson(response, 404, {
        errors: [`Seat ${String(playerId)} not found.`],
      });
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
  if (request.method === "POST" && seatClaimRoute !== null) {
    const matchId = decodeURIComponent(
      seatClaimRoute.groups?.["matchId"] ?? "",
    ) as MatchId;
    const playerId = decodeURIComponent(
      seatClaimRoute.groups?.["playerId"] ?? "",
    ) as PlayerId;
    const result = registry.claimSeat(
      matchId,
      playerId,
      authProvider.authenticate(request),
    );
    if (result === "matchNotFound") {
      matchNotFound(response, matchId);
      return;
    }
    if (result === "seatNotFound") {
      sendJson(response, 404, {
        errors: [`Seat ${String(playerId)} not found.`],
      });
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
      const result = registry.chooseFirstPlayer(
        matchId as MatchId,
        playerId as PlayerId,
        choice,
      );
      if (result === "matchNotFound") {
        matchNotFound(response, matchId);
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
      sendJson(response, 200, result);
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
      matchNotFound(response, matchId);
      return;
    }
    if (request.method === "GET" && resource === "state") {
      sendJson(response, 200, getLocalDevSnapshot(match));
      return;
    }
    if (request.method === "GET" && resource === "cards") {
      sendJson(response, 200, getLocalDevCardCatalog(match));
      return;
    }
    sendJson(response, 404, { errors: ["API route not found."] });
    return;
  }
  if (request.method === "GET" && pathname === "/api/state") {
    sendJson(response, 200, getLocalDevSnapshot(defaultMatch));
    return;
  }
  if (request.method === "GET" && pathname === "/api/cards") {
    sendJson(response, 200, getLocalDevCardCatalog(defaultMatch));
    return;
  }
  if (request.method === "POST" && pathname === "/api/reset") {
    let body: unknown;
    try {
      body = await readRequestJson(request);
    } catch {
      sendJson(response, 400, { errors: ["Request body must be JSON."] });
      return;
    }
    const resetRequest: DevResetRequest = isRecord(body) ? body : {};
    if (
      resetRequest.setup !== undefined &&
      !isDevMatchSetup(resetRequest.setup)
    ) {
      sendJson(response, 400, { errors: ["Invalid dev match setup."] });
      return;
    }
    const explicitSetup =
      resetRequest.setup === undefined ? undefined : resetRequest.setup;
    const reset = await registry.resetMatch(
      registry.defaultMatchId,
      explicitSetup,
    );
    sendJson(response, 200, reset.snapshot);
    return;
  }
  sendJson(response, 404, { errors: ["API route not found."] });
};

const handleNotFoundRequest = (response: ServerResponse): Promise<void> => {
  sendText(response, 404, "text/plain; charset=utf-8", "Not found");
  return Promise.resolve();
};

const websocketAccept = (key: string): string =>
  createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

export const websocketTextFrame = (payload: string): Buffer => {
  const body = Buffer.from(payload, "utf8");
  if (body.length < 126) {
    return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  }
  if (body.length <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }
  if (body.length > Number.MAX_SAFE_INTEGER) {
    throw new Error("WebSocket payload is too large to frame safely.");
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeUInt32BE(Math.floor(body.length / 0x100000000), 2);
  header.writeUInt32BE(body.length >>> 0, 6);
  return Buffer.concat([header, body]);
};

const parseWebSocketFrames = (
  buffer: Buffer,
): {
  messages: string[];
  remaining: Buffer;
  close: boolean;
} => {
  const messages: string[] = [];
  let offset = 0;
  let close = false;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    if (first === undefined || second === undefined) break;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      close = true;
      break;
    }
    const maskLength = masked ? 4 : 0;
    const frameEnd = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) break;
    if (opcode === 0x8) {
      close = true;
      offset = frameEnd;
      break;
    }
    if (opcode === 0x1) {
      const payloadStart = offset + headerLength + maskLength;
      const payload = Buffer.from(buffer.subarray(payloadStart, frameEnd));
      if (masked) {
        const mask = buffer.subarray(offset + headerLength, payloadStart);
        for (let index = 0; index < payload.length; index += 1) {
          const key = mask[index % 4];
          if (key !== undefined) {
            payload.writeUInt8(payload.readUInt8(index) ^ key, index);
          }
        }
      }
      messages.push(payload.toString("utf8"));
    }
    offset = frameEnd;
  }
  return { messages, remaining: Buffer.from(buffer.subarray(offset)), close };
};

interface DevSocketBaseConnection {
  socket: Duplex;
  serverSeq: number;
}

interface DevSocketConnection extends DevSocketBaseConnection {
  matchId: MatchId;
  playerId: PlayerId;
}

interface DevLobbySocketConnection extends DevSocketBaseConnection {
  lobbyId: string;
  playerId: PlayerId;
}

const sendSocketJson = (
  connection: DevSocketBaseConnection,
  payload: Record<string, unknown>,
): void => {
  connection.socket.write(websocketTextFrame(JSON.stringify(payload)));
};

const playerStatePayload = (
  match: LocalDevMatch,
  connection: DevSocketConnection,
): Record<string, unknown> => {
  const snapshot = getLocalDevSnapshotForPlayer(match, connection.playerId);
  return {
    type: "stateSync",
    matchId: connection.matchId,
    serverSeq: ++connection.serverSeq,
    stateSeq: snapshot.stateSeq,
    snapshot,
    cards: getLocalDevCardCatalogForPlayer(match, connection.playerId),
  };
};

const lobbyStatePayload = (
  lobby: CreatedDevLobbyResponse,
  connection: DevLobbySocketConnection,
): Record<string, unknown> => ({
  type: "lobbySync",
  lobbyId: connection.lobbyId,
  serverSeq: ++connection.serverSeq,
  lobby,
});

const broadcastLobbyState = (
  lobby: CreatedDevLobbyResponse,
  connections: Set<DevLobbySocketConnection>,
): void => {
  for (const connection of connections) {
    if (connection.lobbyId === lobby.lobbyId) {
      sendSocketJson(connection, lobbyStatePayload(lobby, connection));
    }
  }
};

const handleWebSocketUpgrade = (
  request: IncomingMessage,
  socket: Duplex,
  registry: LocalDevMatchRegistry,
  lobbyRegistry: LocalDevLobbyRegistry,
  authProvider: AuthProvider,
  connections: Set<DevSocketConnection>,
  lobbyConnections: Set<DevLobbySocketConnection>,
): void => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const lobbyRoute = /^\/api\/lobbies\/(?<lobbyId>[^/]+)\/ws$/u.exec(
    url.pathname,
  );
  if (lobbyRoute !== null) {
    const lobbyId = decodeURIComponent(lobbyRoute.groups?.["lobbyId"] ?? "");
    const playerId = (url.searchParams.get("playerId") ?? "") as PlayerId;
    const key = request.headers["sec-websocket-key"];
    const lobby = lobbyRegistry.getLobby(lobbyId);
    if (
      lobby === undefined ||
      typeof key !== "string" ||
      key.length === 0 ||
      playerId.length === 0 ||
      lobby.seats[String(playerId)]?.claimed !== true
    ) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
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
    socket.on("close", () => {
      lobbyConnections.delete(connection);
    });
    sendSocketJson(connection, lobbyStatePayload(lobby, connection));

    let buffered: Buffer = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
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
  if (
    match === undefined ||
    typeof key !== "string" ||
    key.length === 0 ||
    playerId.length === 0 ||
    sessionToken.length === 0
  ) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }
  void authProvider;
  const auth: AuthContext = {
    subject: { type: "anonymousDev", devSessionId: sessionToken },
  };
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
  socket.on("close", () => {
    connections.delete(connection);
  });
  sendSocketJson(connection, playerStatePayload(match, connection));

  let buffered: Buffer = Buffer.alloc(0);
  socket.on("data", (chunk: Buffer) => {
    buffered = Buffer.concat([buffered, chunk]);
    const parsed = parseWebSocketFrames(buffered);
    buffered = parsed.remaining;
    if (parsed.close) {
      socket.end();
      return;
    }
    for (const raw of parsed.messages) {
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
      const result = registry.applyEnvelope(envelope);
      if (result === "matchNotFound") {
        sendSocketJson(connection, {
          type: "matchError",
          matchId,
          serverSeq: ++connection.serverSeq,
          message: "Match session is not active on this server.",
        });
        continue;
      }
      const errors = [...result.errors];
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
      if (result.accepted) {
        for (const peer of connections) {
          if (peer.matchId === matchId) {
            sendSocketJson(peer, playerStatePayload(match, peer));
          }
        }
      }
    }
  });
};

export const createDevHttpServer = async (
  options: CreateDevHttpServerOptions = {},
): Promise<DevHttpServer> => {
  const createDefaultSetup = async (matchId?: MatchId) =>
    createPremadeDevMatchSetup({
      ...(matchId === undefined ? {} : { matchId }),
      ...(options.fetchCard === undefined
        ? {}
        : { fetchCard: options.fetchCard }),
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      ...(options.redisUrl === undefined ? {} : { redisUrl: options.redisUrl }),
    });
  const registry = await createLocalDevMatchRegistry(
    createDefaultSetup,
    options.setup,
  );
  const lobbyRegistry = createLocalDevLobbyRegistry(registry);
  const authProvider = createDevAuthProvider();
  const socketConnections = new Set<DevSocketConnection>();
  const lobbySocketConnections = new Set<DevLobbySocketConnection>();
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    const operation = url.startsWith("/api/")
      ? handleApiRequest(
          request,
          response,
          registry,
          lobbyRegistry,
          lobbySocketConnections,
          authProvider,
        )
      : handleNotFoundRequest(response);
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
    );
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
      for (const connection of socketConnections) {
        connection.socket.destroy();
      }
      socketConnections.clear();
      for (const connection of lobbySocketConnections) {
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
