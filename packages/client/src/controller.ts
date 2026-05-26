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
  MatchLiveTransport,
  MatchSnapshot,
  MatchTransport,
  LiveMatchConnection,
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
  connectLive: (input: {
    onState: (state: MatchClientState) => void;
    onError: (message: string) => void;
  }) => void;
  disconnectLive: () => void;
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

const requireLiveConnection = (
  liveConnection: LiveMatchConnection | undefined,
): LiveMatchConnection => {
  if (liveConnection === undefined) {
    throw new Error("Live match connection is not active.");
  }
  return liveConnection;
};

export const createMatchClientController = ({
  transport,
  liveTransport,
  sessionStore,
}: {
  transport: MatchTransport;
  liveTransport?: MatchLiveTransport;
  sessionStore: ClientSessionStore;
}): MatchClientController => {
  let currentState: MatchClientState | undefined;
  let currentLobbyState: LobbyClientState | undefined;
  let liveConnection: LiveMatchConnection | undefined;

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
    connectLive({ onState, onError }) {
      const credential = sessionStore.loadClaimedSeat();
      if (
        credential === undefined ||
        liveTransport === undefined ||
        liveConnection !== undefined
      ) {
        return;
      }
      liveConnection = liveTransport.connect({
        matchId: credential.matchId,
        playerId: credential.playerId,
        sessionToken: credential.sessionToken,
        onError,
        onStateSync(message) {
          currentState = {
            matchId: message.matchId,
            seat: {
              matchId: message.matchId,
              playerId: credential.playerId,
            },
            snapshot: message.snapshot,
            cards: message.cards,
          };
          currentLobbyState = undefined;
          onState(currentState);
        },
      });
    },
    disconnectLive() {
      liveConnection?.close();
      liveConnection = undefined;
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
      const transportInput = {
        matchId: credential.matchId,
        playerId: credential.playerId,
        actionIndex: input.actionIndex,
        ...(currentState === undefined
          ? {}
          : { expectedStateSeq: currentState.snapshot.stateSeq }),
      };
      const result =
        liveTransport === undefined
          ? await transport.submitVisibleAction({
              ...transportInput,
              sessionToken: credential.sessionToken,
            })
          : await requireLiveConnection(liveConnection).submitVisibleAction(
              transportInput,
            );
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
      const transportInput = {
        matchId: credential.matchId,
        playerId: credential.playerId,
        decisionId: input.decisionId,
        response: input.response,
      };
      const result =
        liveTransport === undefined
          ? await transport.respondToDecision({
              ...transportInput,
              sessionToken: credential.sessionToken,
            })
          : await requireLiveConnection(liveConnection).respondToDecision(
              transportInput,
            );
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
