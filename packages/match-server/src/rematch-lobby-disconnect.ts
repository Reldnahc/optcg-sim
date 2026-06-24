import type { PlayerId } from "@optcg/types";

import type { CustomLobbyRegistry } from "./custom-lobby-registry.js";
import type { DevLobbySocketConnection } from "./dev-socket-connections.js";

export const cancelRematchLobbyAfterDisconnect = ({
  lobbyConnections,
  lobbyId,
  lobbyRegistry,
  onCancelled,
  playerId,
  rematchLobbyDisconnectGraceMs,
}: {
  readonly lobbyConnections: Set<DevLobbySocketConnection>;
  readonly lobbyId: string;
  readonly lobbyRegistry: CustomLobbyRegistry;
  readonly onCancelled: () => void;
  readonly playerId: PlayerId;
  readonly rematchLobbyDisconnectGraceMs: number;
}): void => {
  const cancelDisconnectedRematchLobby = () => {
    if (
      [...lobbyConnections].some(
        (connection) =>
          connection.lobbyId === lobbyId && connection.playerId === playerId,
      )
    ) {
      return;
    }
    void lobbyRegistry.cancelRematchLobby(lobbyId).then((cancelled) => {
      if (cancelled) {
        onCancelled();
      }
    });
  };
  if (rematchLobbyDisconnectGraceMs <= 0) {
    cancelDisconnectedRematchLobby();
    return;
  }
  const cancelTimer = setTimeout(
    cancelDisconnectedRematchLobby,
    rematchLobbyDisconnectGraceMs,
  );
  cancelTimer.unref();
};
