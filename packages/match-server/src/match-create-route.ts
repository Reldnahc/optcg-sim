import type { ServerResponse } from "node:http";

import { sendJson } from "./http-response.js";

export const handleCreateMatchRequest = async <T>(
  response: ServerResponse,
  createMatch: () => Promise<T>,
  allowTemplateMatches: boolean,
): Promise<void> => {
  if (!allowTemplateMatches) {
    sendJson(response, 409, {
      errors: ["Create a lobby and submit account loadouts to start a match."],
    });
    return;
  }
  sendJson(response, 201, await createMatch());
};
