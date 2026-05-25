import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DecisionId, DecisionResponse, PlayerId } from "@optcg/types";

import {
  applyLocalDevAction,
  applyLocalDevDecision,
  createLocalDevMatch,
  getLocalDevCardCatalog,
  getLocalDevSnapshot,
  isDevMatchSetup,
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

export interface DevHttpServer {
  listen: (port: number, host?: string) => Promise<void>;
  close: () => Promise<void>;
  url: () => string;
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

const handleApiRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  matchRef: { match: LocalDevMatch },
): Promise<void> => {
  const url = request.url ?? "/";
  if (request.method === "GET" && url === "/api/state") {
    sendJson(response, 200, getLocalDevSnapshot(matchRef.match));
    return;
  }
  if (request.method === "GET" && url === "/api/cards") {
    sendJson(response, 200, getLocalDevCardCatalog(matchRef.match));
    return;
  }
  if (request.method === "POST" && url === "/api/reset") {
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
    matchRef.match = createLocalDevMatch(resetRequest.setup);
    sendJson(response, 200, getLocalDevSnapshot(matchRef.match));
    return;
  }
  if (request.method === "POST" && url === "/api/action") {
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
    sendJson(response, 200, applyLocalDevAction(matchRef.match, body));
    return;
  }
  if (request.method === "POST" && url === "/api/decision") {
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
    sendJson(response, 200, applyLocalDevDecision(matchRef.match, body));
    return;
  }
  sendJson(response, 404, { errors: ["API route not found."] });
};

const handleStaticRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const url = request.url ?? "/";
  const route = staticRoutes.get(url);
  if (request.method !== "GET" || route === undefined) {
    sendText(response, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }
  const file = new URL(route, uiRoot);
  const body = await readFile(fileURLToPath(file), "utf8");
  sendText(response, 200, contentTypeForPath(route), body);
};

export const createDevHttpServer = (): DevHttpServer => {
  const matchRef = { match: createLocalDevMatch() };
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    const operation = url.startsWith("/api/")
      ? handleApiRequest(request, response, matchRef)
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
