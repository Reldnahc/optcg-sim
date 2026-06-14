import type { Duplex } from "node:stream";
import type { MatchId, PlayerId } from "@optcg/types";

import type {
  getLocalDevSnapshotForPlayer,
  LocalDevMatch,
} from "./local-match.js";

interface MatchSocketConnection {
  readonly matchId: MatchId;
  readonly playerId: PlayerId;
  readonly socket: Pick<Duplex, "destroyed" | "writableEnded">;
}

export const playerConnectionStatus = (
  matchId: MatchId,
  playerId: PlayerId,
  connections: ReadonlySet<MatchSocketConnection>,
  virtualConnectedPlayerIds: ReadonlySet<PlayerId> = new Set(),
): "connected" | "disconnected" => {
  if (virtualConnectedPlayerIds.has(playerId)) {
    return "connected";
  }
  for (const connection of connections) {
    if (
      connection.matchId === matchId &&
      connection.playerId === playerId &&
      !connection.socket.destroyed &&
      !connection.socket.writableEnded
    ) {
      return "connected";
    }
  }
  return "disconnected";
};

export const connectedPlayerIdsForMatch = (
  matchId: MatchId,
  connections: ReadonlySet<MatchSocketConnection>,
): ReadonlySet<PlayerId> => {
  const playerIds = new Set<PlayerId>();
  for (const connection of connections) {
    if (
      connection.matchId === matchId &&
      !connection.socket.destroyed &&
      !connection.socket.writableEnded
    ) {
      playerIds.add(connection.playerId);
    }
  }
  return playerIds;
};

export const snapshotWithConnectionStatuses = (
  snapshot: ReturnType<typeof getLocalDevSnapshotForPlayer>,
  match: LocalDevMatch,
  matchId: MatchId,
  connections: ReadonlySet<MatchSocketConnection>,
  virtualConnectedPlayerIds: ReadonlySet<PlayerId> = new Set(),
): ReturnType<typeof getLocalDevSnapshotForPlayer> => {
  const playerLabels = { ...(snapshot.playerLabels ?? {}) };
  for (const playerId of Object.keys(match.state.players) as PlayerId[]) {
    playerLabels[playerId] = {
      ...(playerLabels[playerId] ?? {}),
      connectionStatus: playerConnectionStatus(
        matchId,
        playerId,
        connections,
        virtualConnectedPlayerIds,
      ),
    };
  }
  return {
    ...snapshot,
    playerLabels,
  };
};
