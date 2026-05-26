import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DecisionId,
  DecisionResponse,
  MatchId,
  PlayerId,
} from "@optcg/types";

import {
  applyLocalDevAction,
  applyLocalDevDecision,
  createLocalDevMatch,
  createPremadeDevMatchSetup,
  getLocalDevCardCatalogForPlayer,
  getLocalDevCardCatalog,
  getLocalDevSnapshotForPlayer,
  getLocalDevSnapshot,
  isDevMatchSetup,
  type CreatePremadeDevMatchSetupOptions,
  type LocalDevMatch,
} from "./local-match.js";

interface DevActionRequest {
  playerId: PlayerId;
  actionIndex: number;
  expectedStateSeq?: number;
}

interface DevDecisionRequest {
  playerId: PlayerId;
  decisionId: DecisionId;
  response: DecisionResponse;
}

interface DevSocketActionEnvelope extends DevActionRequest {
  type: "submitAction";
  matchId: MatchId;
  clientActionId: string;
}

interface DevSocketDecisionEnvelope extends DevDecisionRequest {
  type: "respondToDecision";
  matchId: MatchId;
  clientActionId: string;
}

type DevSocketEnvelope = DevSocketActionEnvelope | DevSocketDecisionEnvelope;

interface DevResetRequest {
  setup?: unknown;
}

interface CreatedDevMatchResponse {
  matchId: MatchId;
  seats: Record<string, { playerId: PlayerId; claimed: boolean }>;
  snapshot: ReturnType<typeof getLocalDevSnapshot>;
}

interface ClaimedDevSeatResponse {
  matchId: MatchId;
  seat: { playerId: PlayerId; sessionToken: string };
}

interface CreatedDevLobbyResponse {
  lobbyId: string;
  seats: Record<string, { playerId: PlayerId; claimed: boolean }>;
  matchId?: MatchId;
}

type AuthSubject =
  | { type: "anonymousDev"; devSessionId: string }
  | { type: "user"; userId: string; sessionId: string };

interface AuthContext {
  subject: AuthSubject;
}

interface AuthProvider {
  authenticate: (request: IncomingMessage) => AuthContext | undefined;
}

interface MatchSeat {
  matchId: MatchId;
  playerId: PlayerId;
  subject?: AuthContext["subject"];
}

interface LocalDevMatchSession {
  match: LocalDevMatch;
  seats: Record<string, MatchSeat>;
}

interface LocalDevMatchRegistry {
  createMatch: (
    setup?: Parameters<typeof createLocalDevMatch>[0],
  ) => Promise<CreatedDevMatchResponse>;
  resetMatch: (
    matchId: MatchId,
    setup?: Parameters<typeof createLocalDevMatch>[0],
  ) => Promise<CreatedDevMatchResponse>;
  claimSeat: (
    matchId: MatchId,
    playerId: PlayerId,
    auth: AuthContext | undefined,
  ) => ClaimedDevSeatResponse | "matchNotFound" | "seatNotFound" | "claimed";
  getMatch: (matchId: MatchId) => LocalDevMatch | undefined;
  authorizeSeat: (
    auth: AuthContext | undefined,
    matchId: MatchId,
    playerId: PlayerId,
  ) => "authorized" | "unauthenticated" | "forbidden";
  defaultMatchId: MatchId;
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

const uiRoot = new URL("../ui/", import.meta.url);
const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const staticRoutes = new Map<string, string>([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/app.js", "app.js"],
  ["/styles.css", "styles.css"],
]);

const contentTypeForPath = (path: string): string => {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    default:
      return "application/octet-stream";
  }
};

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

const isDevActionRequest = (value: unknown): value is DevActionRequest => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["playerId"] === "string" &&
    Number.isInteger(candidate["actionIndex"]) &&
    (candidate["expectedStateSeq"] === undefined ||
      Number.isInteger(candidate["expectedStateSeq"]))
  );
};

const isDevDecisionRequest = (value: unknown): value is DevDecisionRequest => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const response = candidate["response"];
  return (
    typeof candidate["playerId"] === "string" &&
    typeof candidate["decisionId"] === "string" &&
    typeof response === "object" &&
    response !== null &&
    typeof (response as Record<string, unknown>)["type"] === "string"
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isDevSocketEnvelope = (value: unknown): value is DevSocketEnvelope => {
  if (!isRecord(value)) {
    return false;
  }
  if (
    value["type"] === "submitAction" &&
    typeof value["matchId"] === "string" &&
    typeof value["clientActionId"] === "string"
  ) {
    return isDevActionRequest(value);
  }
  if (
    value["type"] === "respondToDecision" &&
    typeof value["matchId"] === "string" &&
    typeof value["clientActionId"] === "string"
  ) {
    return isDevDecisionRequest(value);
  }
  return false;
};

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

const authRejected = (
  response: ServerResponse,
  result: "unauthenticated" | "forbidden",
): void => {
  if (result === "unauthenticated") {
    sendJson(response, 401, { errors: ["Missing or invalid session token."] });
    return;
  }
  sendJson(response, 403, {
    errors: ["Session token is not authorized for this match seat."],
  });
};

const createLocalAnonSeats = (
  setup: Parameters<typeof createLocalDevMatch>[0],
): Record<string, MatchSeat> =>
  Object.fromEntries(
    setup.playerOrder.map((playerId): [string, MatchSeat] => [
      playerId,
      {
        matchId: setup.matchId,
        playerId,
      },
    ]),
  );

const createLobbySeats = (): LocalDevLobby["seats"] => ({
  p1: { playerId: p1, claimed: false },
  p2: { playerId: p2, claimed: false },
});

const createdSeatResponse = (
  seats: Record<string, MatchSeat>,
): CreatedDevMatchResponse["seats"] =>
  Object.fromEntries(
    Object.entries(seats).map(([key, seat]) => [
      key,
      {
        playerId: seat.playerId,
        claimed: seat.subject !== undefined,
      },
    ]),
  );

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

const subjectsMatch = (left: AuthSubject, right: AuthSubject): boolean => {
  switch (left.type) {
    case "anonymousDev":
      return (
        right.type === "anonymousDev" &&
        left.devSessionId === right.devSessionId
      );
    case "user":
      return (
        right.type === "user" &&
        left.userId === right.userId &&
        left.sessionId === right.sessionId
      );
  }
};

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

const createLocalDevMatchRegistry = async (
  createDefaultSetup: (
    matchId?: MatchId,
  ) => Promise<Parameters<typeof createLocalDevMatch>[0]>,
  initialSetup?: Parameters<typeof createLocalDevMatch>[0],
): Promise<LocalDevMatchRegistry> => {
  let nextMatchNumber = 1;
  const sessions = new Map<MatchId, LocalDevMatchSession>();
  const defaultSetup =
    initialSetup ?? (await createDefaultSetup("dev-local-match" as MatchId));
  const defaultMatchId = defaultSetup.matchId;
  sessions.set(defaultMatchId, {
    match: createLocalDevMatch(defaultSetup),
    seats: createLocalAnonSeats(defaultSetup),
  });

  const buildCreatedResponse = (
    setup: Parameters<typeof createLocalDevMatch>[0],
    session: LocalDevMatchSession,
  ): CreatedDevMatchResponse => ({
    matchId: setup.matchId,
    seats: createdSeatResponse(session.seats),
    snapshot: getLocalDevSnapshot(session.match),
  });

  return {
    defaultMatchId,
    async createMatch(setup) {
      const actualSetup =
        setup ??
        (await createDefaultSetup(
          `dev-local-match-${String(nextMatchNumber++)}` as MatchId,
        ));
      const session = {
        match: createLocalDevMatch(actualSetup),
        seats: createLocalAnonSeats(actualSetup),
      };
      sessions.set(actualSetup.matchId, session);
      return buildCreatedResponse(actualSetup, session);
    },
    async resetMatch(matchId, setup) {
      const actualSetup = setup ?? (await createDefaultSetup(matchId));
      const normalizedSetup = { ...actualSetup, matchId };
      const session = {
        match: createLocalDevMatch(normalizedSetup),
        seats: createLocalAnonSeats(normalizedSetup),
      };
      sessions.set(matchId, session);
      return buildCreatedResponse(normalizedSetup, session);
    },
    claimSeat(matchId, playerId, auth) {
      const session = sessions.get(matchId);
      if (session === undefined) {
        return "matchNotFound";
      }
      const seat = session.seats[String(playerId)];
      if (seat === undefined) {
        return "seatNotFound";
      }
      if (seat.subject !== undefined) {
        if (
          auth !== undefined &&
          subjectsMatch(seat.subject, auth.subject) &&
          seat.subject.type === "anonymousDev"
        ) {
          return {
            matchId,
            seat: {
              playerId,
              sessionToken: seat.subject.devSessionId,
            },
          };
        }
        return "claimed";
      }
      const sessionToken =
        auth?.subject.type === "anonymousDev"
          ? auth.subject.devSessionId
          : `dev-local:${String(matchId)}:${String(playerId)}:${randomUUID()}`;
      seat.subject = { type: "anonymousDev", devSessionId: sessionToken };
      return { matchId, seat: { playerId, sessionToken } };
    },
    getMatch(matchId) {
      return sessions.get(matchId)?.match;
    },
    authorizeSeat(auth, matchId, playerId) {
      if (auth === undefined) {
        return "unauthenticated";
      }
      const seat = sessions.get(matchId)?.seats[String(playerId)];
      if (
        seat === undefined ||
        seat.subject === undefined ||
        !subjectsMatch(seat.subject, auth.subject)
      ) {
        return "forbidden";
      }
      return "authorized";
    },
  };
};

const handleApiRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  registry: LocalDevMatchRegistry,
  lobbyRegistry: LocalDevLobbyRegistry,
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
    const match = registry.getMatch(matchId as MatchId);
    if (match === undefined) {
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
    if (request.method === "POST" && resource === "action") {
      let body: unknown;
      try {
        body = await readRequestJson(request);
      } catch {
        sendJson(response, 400, { errors: ["Request body must be JSON."] });
        return;
      }
      if (!isDevActionRequest(body)) {
        sendJson(response, 400, {
          errors: ["Expected playerId and numeric actionIndex."],
        });
        return;
      }
      const authResult = registry.authorizeSeat(
        authProvider.authenticate(request),
        matchId as MatchId,
        body.playerId,
      );
      if (authResult !== "authorized") {
        authRejected(response, authResult);
        return;
      }
      sendJson(response, 200, applyLocalDevAction(match, body));
      return;
    }
    if (request.method === "POST" && resource === "decision") {
      let body: unknown;
      try {
        body = await readRequestJson(request);
      } catch {
        sendJson(response, 400, { errors: ["Request body must be JSON."] });
        return;
      }
      if (!isDevDecisionRequest(body)) {
        sendJson(response, 400, {
          errors: ["Expected playerId, decisionId, and decision response."],
        });
        return;
      }
      const authResult = registry.authorizeSeat(
        authProvider.authenticate(request),
        matchId as MatchId,
        body.playerId,
      );
      if (authResult !== "authorized") {
        authRejected(response, authResult);
        return;
      }
      sendJson(response, 200, applyLocalDevDecision(match, body));
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
  if (request.method === "POST" && pathname === "/api/action") {
    let body: unknown;
    try {
      body = await readRequestJson(request);
    } catch {
      sendJson(response, 400, { errors: ["Request body must be JSON."] });
      return;
    }
    if (!isDevActionRequest(body)) {
      sendJson(response, 400, {
        errors: ["Expected playerId and numeric actionIndex."],
      });
      return;
    }
    sendJson(response, 200, applyLocalDevAction(defaultMatch, body));
    return;
  }
  if (request.method === "POST" && pathname === "/api/decision") {
    let body: unknown;
    try {
      body = await readRequestJson(request);
    } catch {
      sendJson(response, 400, { errors: ["Request body must be JSON."] });
      return;
    }
    if (!isDevDecisionRequest(body)) {
      sendJson(response, 400, {
        errors: ["Expected playerId, decisionId, and decision response."],
      });
      return;
    }
    sendJson(response, 200, applyLocalDevDecision(defaultMatch, body));
    return;
  }
  sendJson(response, 404, { errors: ["API route not found."] });
};

const handleStaticRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const url = request.url ?? "/";
  const pathname = new URL(url, "http://localhost").pathname;
  const route = staticRoutes.get(pathname);
  if (request.method !== "GET" || route === undefined) {
    sendText(response, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }
  const file = new URL(route, uiRoot);
  const body = await readFile(fileURLToPath(file), "utf8");
  sendText(response, 200, contentTypeForPath(route), body);
};

const websocketAccept = (key: string): string =>
  createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

const websocketTextFrame = (payload: string): Buffer => {
  const body = Buffer.from(payload, "utf8");
  if (body.length < 126) {
    return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  }
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(body.length, 2);
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

interface DevSocketConnection {
  matchId: MatchId;
  playerId: PlayerId;
  socket: Duplex;
  serverSeq: number;
}

const sendSocketJson = (
  connection: DevSocketConnection,
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

const handleWebSocketUpgrade = (
  request: IncomingMessage,
  socket: Duplex,
  registry: LocalDevMatchRegistry,
  authProvider: AuthProvider,
  connections: Set<DevSocketConnection>,
): void => {
  const url = new URL(request.url ?? "/", "http://localhost");
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
      const result =
        payload.type === "submitAction"
          ? applyLocalDevAction(match, payload)
          : applyLocalDevDecision(match, payload);
      const errors = result.errors;
      sendSocketJson(connection, {
        type: "actionResult",
        matchId,
        clientActionId: payload.clientActionId,
        accepted: errors.length === 0,
        stateSeq: result.snapshot.stateSeq,
        actionSeq: result.snapshot.actionSeq,
        errors,
      });
      if (errors.length === 0) {
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
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    const operation = url.startsWith("/api/")
      ? handleApiRequest(
          request,
          response,
          registry,
          lobbyRegistry,
          authProvider,
        )
      : handleStaticRequest(request, response);
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
      authProvider,
      socketConnections,
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
