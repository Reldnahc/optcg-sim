import type { Duplex } from "node:stream";
import type { MatchId, PlayerId } from "@optcg/types";

import type { LocalDevMatchRegistry } from "./dev-local-match-registry.js";
import { connectedPlayerIdsForMatch } from "./dev-match-connection-state.js";

interface MatchSocketConnection {
  readonly matchId: MatchId;
  readonly playerId: PlayerId;
  readonly socket: Pick<Duplex, "destroyed" | "writableEnded">;
}

export const advanceMatchTimersAndBroadcast = async (
  registry: LocalDevMatchRegistry,
  connections: Set<MatchSocketConnection>,
  elapsedMs: number,
  broadcast: (matchId: MatchId, sync: "state" | "timers") => void,
  matchIds?: readonly MatchId[],
): Promise<void> => {
  const changedMatches = await registry.advanceTimers({
    elapsedMs,
    connectedPlayerIds: (matchId) =>
      connectedPlayerIdsForMatch(matchId, connections),
    ...(matchIds === undefined ? {} : { matchIds }),
  });
  for (const changed of changedMatches) {
    broadcast(changed.matchId, changed.sync);
  }
};
