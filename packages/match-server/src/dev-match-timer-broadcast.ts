import type { Duplex } from "node:stream";
import type { MatchId, PlayerId } from "@optcg/types";

import type { LocalDevMatchRegistry } from "./dev-local-match-registry.js";
import { connectedPlayerIdsForMatch } from "./dev-match-connection-state.js";

interface MatchSocketConnection {
  readonly matchId: MatchId;
  readonly playerId: PlayerId;
  readonly socket: Pick<Duplex, "destroyed" | "writableEnded">;
}

export const advanceMatchTimersAndBroadcast = (
  registry: LocalDevMatchRegistry,
  connections: Set<MatchSocketConnection>,
  elapsedMs: number,
  broadcast: (matchId: MatchId) => void,
  matchIds?: readonly MatchId[],
): void => {
  const changedMatchIds = registry.advanceTimers({
    elapsedMs,
    connectedPlayerIds: (matchId) =>
      connectedPlayerIdsForMatch(matchId, connections),
    ...(matchIds === undefined ? {} : { matchIds }),
  });
  for (const matchId of changedMatchIds) {
    broadcast(matchId);
  }
};
