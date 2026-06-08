import type { IncomingMessage, ServerResponse } from "node:http";

type SendJson = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
) => void;

const requestOrigin = (request: IncomingMessage): string | undefined => {
  const origin = request.headers.origin;
  return typeof origin === "string" && origin.length > 0 ? origin : undefined;
};

export const applyBrowserCorsHeaders = (
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: readonly string[],
): boolean => {
  const origin = requestOrigin(request);
  if (origin === undefined || !allowedOrigins.includes(origin)) {
    return false;
  }
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "Origin");
  return true;
};

export const handleBrowserCorsPreflight = (
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: readonly string[],
  sendJson: SendJson,
): boolean => {
  if (request.method !== "OPTIONS") {
    return false;
  }
  if (!applyBrowserCorsHeaders(request, response, allowedOrigins)) {
    sendJson(response, 403, { errors: ["Origin is not allowed."] });
    return true;
  }
  response.writeHead(204, {
    "access-control-allow-headers": "content-type,x-optcg-session-token",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-max-age": "600",
  });
  response.end();
  return true;
};
