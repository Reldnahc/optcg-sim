import {
  sendSocketJson,
  type DevLobbySocketConnection,
  type DevSocketConnection,
} from "./dev-socket-connections.js";

export const serverShutdownMessage =
  "The server is shutting down. Please wait. Your game will resume once reconnected.";

export const broadcastServerShutdown = (
  matchConnections: Set<DevSocketConnection>,
  lobbyConnections: Set<DevLobbySocketConnection>,
): void => {
  for (const connection of matchConnections) {
    sendSocketJson(connection, {
      type: "serverShutdown",
      matchId: connection.matchId,
      serverSeq: ++connection.serverSeq,
      message: serverShutdownMessage,
    });
  }
  for (const connection of lobbyConnections) {
    sendSocketJson(connection, {
      type: "serverShutdown",
      lobbyId: connection.lobbyId,
      serverSeq: ++connection.serverSeq,
      message: serverShutdownMessage,
    });
  }
};
