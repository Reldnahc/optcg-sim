import type { LocalDevMatch } from "./local-match.js";
import { getLocalDevSnapshotForPlayer } from "./local-match.js";
import { buildLocalDevCardCatalogForPlayer } from "./local-card-catalog.js";
import { snapshotWithConnectionStatuses } from "./dev-match-connection-state.js";
import type { DevSocketConnection } from "./dev-socket-connections.js";
import { recordActionTimingSpan } from "./action-timing-log.js";

export const playerStatePayload = (
  match: LocalDevMatch,
  connection: DevSocketConnection,
  connections: ReadonlySet<DevSocketConnection>,
): Record<string, unknown> => {
  const snapshot = recordActionTimingSpan("statePayloadSnapshot", () =>
    snapshotWithConnectionStatuses(
      getLocalDevSnapshotForPlayer(match, connection.playerId),
      match,
      connection.matchId,
      connections,
    ),
  );
  return {
    type: "stateSync",
    matchId: connection.matchId,
    serverSeq: ++connection.serverSeq,
    stateSeq: snapshot.stateSeq,
    snapshot,
    cards: recordActionTimingSpan("statePayloadCardCatalog", () =>
      buildLocalDevCardCatalogForPlayer(
        match.state,
        snapshot,
        connection.playerId,
        match.cardVariantOverrides,
      ),
    ),
  };
};
