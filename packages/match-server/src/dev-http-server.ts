import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
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
  getLocalDevCardCatalog,
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

interface DevResetRequest {
  setup?: unknown;
}

interface CreatedDevMatchResponse {
  matchId: MatchId;
  seats: Record<string, { playerId: PlayerId; sessionToken: string }>;
  snapshot: ReturnType<typeof getLocalDevSnapshot>;
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
  subject: AuthContext["subject"];
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
  getMatch: (matchId: MatchId) => LocalDevMatch | undefined;
  authorizeSeat: (
    auth: AuthContext | undefined,
    matchId: MatchId,
    playerId: PlayerId,
  ) => "authorized" | "unauthenticated" | "forbidden";
  defaultMatchId: MatchId;
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
        subject: {
          type: "anonymousDev",
          devSessionId: `dev-local:${String(setup.matchId)}:${String(
            playerId,
          )}:${randomUUID()}`,
        },
      },
    ]),
  );

const createdSeatResponse = (
  seats: Record<string, MatchSeat>,
): CreatedDevMatchResponse["seats"] =>
  Object.fromEntries(
    Object.entries(seats).map(([key, seat]) => [
      key,
      {
        playerId: seat.playerId,
        sessionToken:
          seat.subject.type === "anonymousDev"
            ? seat.subject.devSessionId
            : seat.subject.sessionId,
      },
    ]),
  );

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
    getMatch(matchId) {
      return sessions.get(matchId)?.match;
    },
    authorizeSeat(auth, matchId, playerId) {
      if (auth === undefined) {
        return "unauthenticated";
      }
      const seat = sessions.get(matchId)?.seats[String(playerId)];
      if (seat === undefined || !subjectsMatch(seat.subject, auth.subject)) {
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
  const authProvider = createDevAuthProvider();
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    const operation = url.startsWith("/api/")
      ? handleApiRequest(request, response, registry, authProvider)
      : handleStaticRequest(request, response);
    operation.catch((error: unknown) => {
      sendJson(response, 500, {
        errors: [error instanceof Error ? error.message : String(error)],
      });
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
