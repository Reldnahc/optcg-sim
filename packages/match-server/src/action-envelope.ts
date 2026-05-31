import { createHash } from "node:crypto";
import type { MatchId, PlayerId } from "@optcg/types";

import { canonicalJson } from "./canonical-json.js";
import type { SessionActionRequest } from "./session-types.js";

export const requestHash = (request: SessionActionRequest): string =>
  createHash("sha256").update(canonicalJson(request)).digest("hex");

export const idempotencyKey = (input: {
  readonly matchId: MatchId;
  readonly playerId: PlayerId;
  readonly clientActionId: string;
}): string =>
  `${String(input.matchId)}:${String(input.playerId)}:${input.clientActionId}`;
