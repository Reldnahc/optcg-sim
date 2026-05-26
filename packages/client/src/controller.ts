import type {
  DecisionId,
  DecisionResponse,
  MatchId,
  PlayerId,
} from "@optcg/types";

import type {
  ClientSeatCredential,
  ClientSeatIdentity,
  ClientSessionStore,
} from "./session.js";
import type {
  LocalLobby,
  MatchCardCatalog,
  MatchSnapshot,
  MatchTransport,
} from "./transport.js";

export interface LobbyClientState {
  lobbyId: string;
  seat: {
    lobbyId: string;
    playerId: PlayerId;
  };
  lobby: LocalLobby;
}

export interface MatchClientState {
  matchId: MatchId;
  seat: ClientSeatIdentity;
  snapshot: MatchSnapshot;
  cards: MatchCardCatalog;
}

export type MatchClientSessionState = LobbyClientState | MatchClientState;

export interface MatchClientController {
  startNewLocalLobby: (playerId: PlayerId) => Promise<MatchClientSessionState>;
  joinLocalLobby: (input: {
    lobbyId: string;
    playerId: PlayerId;
  }) => Promise<MatchClientSessionState>;
  startNewLocalMatch: (playerId: PlayerId) => Promise<MatchClientState>;
  joinLocalMatch: (input: ClientSeatIdentity) => Promise<MatchClientState>;
  refresh: () => Promise<MatchClientSessionState>;
  submitVisibleAction: (input: {
    actionIndex: number;
  }) => Promise<MatchClientState>;
  respondToDecision: (input: {
    decisionId: DecisionId;
    response: DecisionResponse;
  }) => Promise<MatchClientState>;
  currentCredential: () => ClientSeatCredential | undefined;
  currentState: () => MatchClientState | undefined;
}

const requireCredential = (
  sessionStore: ClientSessionStore,
): ClientSeatCredential => {
  const credential = sessionStore.loadClaimedSeat();
  if (credential === undefined) {
    throw new Error("Cannot submit an action before claiming a seat.");
  }
  return credential;
};

const throwIfActionResultFailed = (errors: readonly string[]): void => {
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
};

export const createMatchClientController = ({
  transport,
  sessionStore,
}: {
  transport: MatchTransport;
  sessionStore: ClientSessionStore;
}): MatchClientController => {
  let currentState: MatchClientState | undefined;
  let currentLobbyState: LobbyClientState | undefined;

  const loadState = async (
    seat: ClientSeatIdentity,
  ): Promise<MatchClientState> => {
    const [snapshot, cards] = await Promise.all([
      transport.loadState(seat.matchId),
      transport.loadCards(seat.matchId),
    ]);
    currentState = {
      matchId: seat.matchId,
      seat,
      snapshot,
      cards,
    };
    currentLobbyState = undefined;
    return currentState;
  };

  const claimAndLoad = async (
    seat: ClientSeatIdentity,
  ): Promise<MatchClientState> => {
    sessionStore.setCurrentSeat(seat);
    const existing = sessionStore.loadClaimedSeat();
    const claimed = await transport.claimSeat({
      ...seat,
      ...(existing === undefined
        ? {}
        : { sessionToken: existing.sessionToken }),
    });
    sessionStore.saveClaimedSeat({
      matchId: claimed.matchId,
      playerId: claimed.seat.playerId,
      sessionToken: claimed.seat.sessionToken,
    });
    return loadState(seat);
  };

  const claimMatchIfReady = async (
    lobbyState: LobbyClientState,
  ): Promise<MatchClientSessionState> => {
    const matchId = lobbyState.lobby.matchId;
    if (matchId === undefined) {
      currentLobbyState = lobbyState;
      return lobbyState;
    }
    return claimAndLoad({ matchId, playerId: lobbyState.seat.playerId });
  };

  return {
    async startNewLocalLobby(playerId) {
      const lobby = await transport.createLobby();
      const claimedLobby = await transport.claimLobbySeat({
        lobbyId: lobby.lobbyId,
        playerId,
      });
      return claimMatchIfReady({
        lobbyId: claimedLobby.lobbyId,
        seat: { lobbyId: claimedLobby.lobbyId, playerId },
        lobby: claimedLobby,
      });
    },
    async joinLocalLobby(input) {
      const claimedLobby = await transport.claimLobbySeat(input);
      return claimMatchIfReady({
        lobbyId: claimedLobby.lobbyId,
        seat: { lobbyId: claimedLobby.lobbyId, playerId: input.playerId },
        lobby: claimedLobby,
      });
    },
    async startNewLocalMatch(playerId) {
      const created = await transport.createMatch();
      const seat = { matchId: created.matchId, playerId };
      sessionStore.setCurrentSeat(seat);
      const claimed = await transport.claimSeat(seat);
      sessionStore.saveClaimedSeat({
        matchId: claimed.matchId,
        playerId: claimed.seat.playerId,
        sessionToken: claimed.seat.sessionToken,
      });
      const cards = await transport.loadCards(created.matchId);
      currentState = {
        matchId: created.matchId,
        seat,
        snapshot: created.snapshot,
        cards,
      };
      currentLobbyState = undefined;
      return currentState;
    },
    joinLocalMatch(input) {
      return claimAndLoad(input);
    },
    async refresh() {
      if (currentLobbyState !== undefined) {
        const lobby = await transport.loadLobby(currentLobbyState.lobbyId);
        return claimMatchIfReady({
          ...currentLobbyState,
          lobby,
        });
      }
      const seat = sessionStore.loadCurrentSeat();
      if (seat === undefined) {
        throw new Error("Cannot refresh a match before selecting a seat.");
      }
      return loadState(seat);
    },
    async submitVisibleAction(input) {
      const credential = requireCredential(sessionStore);
      const result = await transport.submitVisibleAction({
        matchId: credential.matchId,
        playerId: credential.playerId,
        sessionToken: credential.sessionToken,
        actionIndex: input.actionIndex,
        ...(currentState === undefined
          ? {}
          : { expectedStateSeq: currentState.snapshot.stateSeq }),
      });
      throwIfActionResultFailed(result.errors);
      const cards =
        currentState?.cards ?? (await transport.loadCards(credential.matchId));
      currentState = {
        matchId: credential.matchId,
        seat: {
          matchId: credential.matchId,
          playerId: credential.playerId,
        },
        snapshot: result.snapshot,
        cards,
      };
      return currentState;
    },
    async respondToDecision(input) {
      const credential = requireCredential(sessionStore);
      const result = await transport.respondToDecision({
        matchId: credential.matchId,
        playerId: credential.playerId,
        sessionToken: credential.sessionToken,
        decisionId: input.decisionId,
        response: input.response,
      });
      throwIfActionResultFailed(result.errors);
      const cards =
        currentState?.cards ?? (await transport.loadCards(credential.matchId));
      currentState = {
        matchId: credential.matchId,
        seat: {
          matchId: credential.matchId,
          playerId: credential.playerId,
        },
        snapshot: result.snapshot,
        cards,
      };
      return currentState;
    },
    currentCredential() {
      return sessionStore.loadClaimedSeat();
    },
    currentState() {
      return currentState;
    },
  };
};
