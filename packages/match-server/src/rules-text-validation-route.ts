import type { IncomingMessage, ServerResponse } from "node:http";
import { validateRulesText } from "@optcg/card-support";

import { sendJson } from "./http-response.js";
import { isRecord, readRequestJson } from "./request-json.js";

interface HandleRulesTextValidationRequestInput {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly token: string | undefined;
}

export const handleRulesTextValidationRequest = async ({
  request,
  response,
  pathname,
  token,
}: HandleRulesTextValidationRequestInput): Promise<boolean> => {
  if (
    request.method !== "POST" ||
    pathname !== "/internal/rules-text/validate"
  ) {
    return false;
  }
  if (token === undefined) {
    sendJson(response, 404, { errors: ["API route not found."] });
    return true;
  }
  if (request.headers["x-poneglyph-internal-token"] !== token) {
    sendJson(response, 401, { errors: ["Internal token is required."] });
    return true;
  }

  let body: unknown;
  try {
    body = await readRequestJson(request);
  } catch {
    sendJson(response, 400, { errors: ["Request body must be JSON."] });
    return true;
  }
  if (!isRecord(body)) {
    sendJson(response, 400, { errors: ["Request body must be an object."] });
    return true;
  }

  let effect: string | null;
  let trigger: string | null;
  try {
    effect = nullableString(body["effect"], "effect");
    trigger = nullableString(body["trigger"], "trigger");
  } catch (error) {
    sendJson(response, 400, {
      errors: [error instanceof Error ? error.message : "Invalid rules text."],
    });
    return true;
  }

  sendJson(response, 200, { data: validateRulesText({ effect, trigger }) });
  return true;
};

const nullableString = (
  value: unknown,
  field: "effect" | "trigger",
): string | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  return value;
};
