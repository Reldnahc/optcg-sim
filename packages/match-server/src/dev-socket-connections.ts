import type { Duplex } from "node:stream";
import type { MatchId, PlayerId } from "@optcg/types";

import { websocketTextFrame } from "./dev-websocket-protocol.js";

export interface DevSocketBaseConnection {
  socket: Duplex;
  serverSeq: number;
  heartbeat?: ReturnType<typeof setInterval>;
  idleTimeout?: ReturnType<typeof setTimeout>;
}

export interface DevSocketConnection extends DevSocketBaseConnection {
  matchId: MatchId;
  playerId: PlayerId;
  sentCardCatalog?: boolean;
}

export interface DevLobbySocketConnection extends DevSocketBaseConnection {
  lobbyId: string;
  playerId: PlayerId;
}

export const sendSocketJson = (
  connection: DevSocketBaseConnection,
  payload: Record<string, unknown>,
): void => {
  if (connection.socket.destroyed || connection.socket.writableEnded) {
    return;
  }
  try {
    connection.socket.write(websocketTextFrame(JSON.stringify(payload)));
  } catch {
    connection.socket.destroy();
  }
};

export const clearConnectionHeartbeat = (
  connection: DevSocketBaseConnection,
): void => {
  if (connection.heartbeat === undefined) {
    return;
  }
  clearInterval(connection.heartbeat);
  delete connection.heartbeat;
};

export const clearConnectionIdleTimeout = (
  connection: DevSocketBaseConnection,
): void => {
  if (connection.idleTimeout === undefined) {
    return;
  }
  clearTimeout(connection.idleTimeout);
  delete connection.idleTimeout;
};

export const resetConnectionIdleTimeout = (
  connection: DevSocketBaseConnection,
  idleTimeoutMs: number,
): void => {
  clearConnectionIdleTimeout(connection);
  connection.idleTimeout = setTimeout(() => {
    connection.socket.end();
  }, idleTimeoutMs);
  connection.idleTimeout.unref();
};

export const startConnectionHeartbeat = (
  connection: DevSocketBaseConnection,
  type: "heartbeat" | "lobbyHeartbeat",
): void => {
  connection.heartbeat = setInterval(() => {
    sendSocketJson(connection, {
      type,
      serverSeq: ++connection.serverSeq,
    });
  }, 25_000);
  connection.heartbeat.unref();
};

export const registerConnectionLifecycle = (
  connection: DevSocketBaseConnection,
  onClose: () => void,
): void => {
  let closed = false;
  connection.socket.on("error", () => {
    connection.socket.destroy();
  });
  connection.socket.on("close", () => {
    if (closed) {
      return;
    }
    closed = true;
    clearConnectionHeartbeat(connection);
    clearConnectionIdleTimeout(connection);
    onClose();
  });
};
