import type { MatchId, PlayerId } from "@optcg/types";

import type { CreatedCustomLobbyResponse } from "./custom-lobby-registry.js";
import type { LocalDevMatchRegistry } from "./dev-local-match-registry.js";
import {
  sendSocketJson,
  type DevLobbySocketConnection,
  type DevSocketConnection,
} from "./dev-socket-connections.js";
import {
  playerStatePayload,
  playerTimerPayload,
} from "./match-state-payload.js";

export const broadcastLobbyState = (
  lobby: CreatedCustomLobbyResponse,
  connections: Set<DevLobbySocketConnection>,
): void => {
  for (const connection of connections) {
    if (connection.lobbyId === lobby.lobbyId) {
      sendSocketJson(connection, {
        type: "lobbySync",
        lobbyId: connection.lobbyId,
        serverSeq: ++connection.serverSeq,
        lobby,
      });
    }
  }
};

export const broadcastLobbyError = (
  lobbyId: string,
  message: string,
  connections: Set<DevLobbySocketConnection>,
): void => {
  for (const connection of connections) {
    if (connection.lobbyId === lobbyId) {
      sendSocketJson(connection, {
        type: "lobbyError",
        lobbyId,
        serverSeq: ++connection.serverSeq,
        message,
      });
    }
  }
};

export const broadcastRematchRequest = (
  matchId: MatchId,
  requestedBy: PlayerId,
  connections: Set<DevSocketConnection>,
): void => {
  for (const connection of connections) {
    if (connection.matchId === matchId) {
      sendSocketJson(connection, {
        type: "rematchRequest",
        matchId,
        serverSeq: ++connection.serverSeq,
        requestedBy,
      });
    }
  }
};

export const broadcastMatchState = (
  matchId: MatchId,
  registry: LocalDevMatchRegistry,
  connections: Set<DevSocketConnection>,
  options: { readonly except?: DevSocketConnection } = {},
): void => {
  const match = registry.getMatch(matchId);
  if (match === undefined) {
    return;
  }
  for (const connection of connections) {
    if (connection.matchId === matchId && connection !== options.except) {
      sendSocketJson(
        connection,
        playerStatePayload(match, connection, connections),
      );
    }
  }
};

export const broadcastMatchTimers = (
  matchId: MatchId,
  registry: LocalDevMatchRegistry,
  connections: Set<DevSocketConnection>,
): void => {
  const match = registry.getMatch(matchId);
  if (match === undefined) {
    return;
  }
  for (const connection of connections) {
    if (connection.matchId === matchId) {
      sendSocketJson(connection, playerTimerPayload(match, connection));
    }
  }
};

export const broadcastSessionTransition = (
  sourceMatchId: MatchId,
  created: {
    readonly matchId?: MatchId;
    readonly lobbyId?: string;
    readonly firstPlayerChoice?: unknown;
  },
  connections: Set<DevSocketConnection>,
): void => {
  for (const connection of connections) {
    if (connection.matchId === sourceMatchId) {
      sendSocketJson(connection, {
        type: "sessionTransition",
        matchId: sourceMatchId,
        serverSeq: ++connection.serverSeq,
        ...(created.matchId === undefined
          ? {}
          : { nextMatchId: created.matchId }),
        ...(created.lobbyId === undefined
          ? {}
          : { nextLobbyId: created.lobbyId }),
        ...(created.firstPlayerChoice === undefined
          ? {}
          : { firstPlayerChoice: created.firstPlayerChoice }),
      });
    }
  }
};
