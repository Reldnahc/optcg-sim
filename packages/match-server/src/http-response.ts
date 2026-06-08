import type { ServerResponse } from "node:http";

export const sendJson = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
};

export const sendText = (
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: string,
): void => {
  response.writeHead(statusCode, { "content-type": contentType });
  response.end(body);
};

export const sendMatchNotFound = (
  response: ServerResponse,
  matchId: string,
): void => {
  sendJson(response, 404, { errors: [`Match ${matchId} not found.`] });
};
