import type { DecisionId, MatchId, PlayerId } from "@optcg/types";

import type {
  LobbyLiveTransport,
  LobbyStateSyncMessage,
  LiveMatchConnection,
  MatchLiveTransport,
  MatchRematchRequestMessage,
  MatchSessionTransitionMessage,
  MatchSetupSyncMessage,
  MatchStateSyncMessage,
  MatchTimerSyncMessage,
  MatchTransport,
} from "./transport.js";

type SubmittedActionRequest = Parameters<
  LiveMatchConnection["submitVisibleAction"]
>[0];

export const accountSessionToken = "user:user-1:session-1";
export const playerTwoAccountSessionToken = "user:user-2:session-1";

export const createFakeTransport = (): MatchTransport & {
  claimedSeats: Array<{
    matchId: MatchId;
    playerId: PlayerId;
    sessionToken?: string;
  }>;
  accountSeatClaims: Array<{
    matchId: MatchId;
    sessionToken: string;
  }>;
  joinedLobbies: Array<{
    lobbyId: string;
    sessionToken: string;
  }>;
  submittedLobbyDecks: Array<{
    lobbyId: string;
    sessionToken: string;
    deckHash: string;
    donDeckCount: number;
  }>;
  submittedLoadoutHandoffs: Array<{ lobbyId: string; handoffToken: string }>;
} => {
  const claimedSeats: Array<{
    matchId: MatchId;
    playerId: PlayerId;
    sessionToken?: string;
  }> = [];
  const accountSeatClaims: Array<{
    matchId: MatchId;
    sessionToken: string;
  }> = [];
  const joinedLobbies: Array<{
    lobbyId: string;
    sessionToken: string;
  }> = [];
  const submittedLobbyDecks: Array<{
    lobbyId: string;
    sessionToken: string;
    deckHash: string;
    donDeckCount: number;
  }> = [];
  const submittedLoadoutHandoffs: Array<{
    lobbyId: string;
    handoffToken: string;
  }> = [];
  const lobbySeats = ({
    p1Ready = false,
    p2Ready = false,
  }: {
    p1Ready?: boolean;
    p2Ready?: boolean;
  } = {}) => ({
    p1: {
      playerId: "p1" as PlayerId,
      claimed: true,
      deck: { status: p1Ready ? "ready" : "missing" } as const,
    },
    p2: {
      playerId: "p2" as PlayerId,
      claimed: false,
      deck: { status: p2Ready ? "ready" : "missing" } as const,
    },
  });
  return {
    claimedSeats,
    accountSeatClaims,
    joinedLobbies,
    submittedLobbyDecks,
    submittedLoadoutHandoffs,
    createLobby() {
      return Promise.resolve({
        lobbyId: "lobby-1",
        seats: lobbySeats(),
      });
    },
    joinLobby(input) {
      joinedLobbies.push(input);
      const rematchPlayerId =
        input.sessionToken === playerTwoAccountSessionToken
          ? ("p2" as PlayerId)
          : ("p1" as PlayerId);
      return Promise.resolve({
        lobbyId: input.lobbyId,
        seat: { playerId: rematchPlayerId },
        seats: lobbySeats({
          p1Ready: false,
          p2Ready: false,
        }),
      });
    },
    joinLobbyByCode() {
      throw new Error("joinLobbyByCode was not expected.");
    },
    submitLobbyDeck(input) {
      submittedLobbyDecks.push(input);
      return Promise.resolve({
        lobbyId: input.lobbyId,
        seats: lobbySeats({ p1Ready: true }),
      });
    },
    submitLobbyLoadoutHandoff(input) {
      submittedLoadoutHandoffs.push(input);
      return Promise.resolve({
        lobbyId: input.lobbyId,
        seat: { playerId: "p1" as PlayerId, sessionToken: "user:u:s" },
        seats: lobbySeats({ p1Ready: true }),
      });
    },
    validateLobbyLoadouts: () => Promise.resolve({ data: { loadouts: [] } }),
    validateLobbyDecks: () => Promise.resolve({ data: { loadouts: [] } }),
    loadLobby(lobbyId) {
      return Promise.resolve({
        lobbyId,
        matchId: "match-1" as MatchId,
        seats: lobbySeats({ p1Ready: true, p2Ready: true }),
      });
    },
    createMatch() {
      return Promise.resolve({
        matchId: "match-1" as MatchId,
        seats: {
          p1: { playerId: "p1" as PlayerId, claimed: false },
          p2: { playerId: "p2" as PlayerId, claimed: false },
        },
        snapshot: { stateSeq: 1, players: {} },
      });
    },
    createRematch(input) {
      return Promise.resolve({
        lobbyId: `${String(input.matchId)}-rematch-lobby-1`,
        seat: { playerId: input.playerId },
        seats: lobbySeats(),
      });
    },
    claimSeat(input) {
      claimedSeats.push(input);
      return Promise.resolve({
        matchId: input.matchId,
        seat: {
          playerId: input.playerId,
          sessionToken: input.sessionToken ?? `token-${String(input.playerId)}`,
        },
      });
    },
    claimSeatForAccount(input) {
      accountSeatClaims.push(input);
      return Promise.resolve({
        matchId: input.matchId,
        seat: {
          playerId: "p1" as PlayerId,
          sessionToken: input.sessionToken,
        },
      });
    },
    chooseFirstPlayer(input) {
      return Promise.resolve({
        matchId: input.matchId,
        firstPlayerChoice: {
          chooserPlayerId: input.playerId,
          choices: ["goFirst", "goSecond"],
          resolvedFirstPlayerId:
            input.choice === "goFirst" ? input.playerId : ("p2" as PlayerId),
        },
        snapshot: { stateSeq: 1, players: {} },
      });
    },
  };
};

export const createFakeLiveTransport = (options?: {
  actionErrors?: string[];
  decisionErrors?: string[];
  rollbackErrors?: string[];
  cancelRollbackErrors?: string[];
}): MatchLiveTransport & {
  submittedActions: number[];
  submittedActionRequests: SubmittedActionRequest[];
  submittedDecisions: DecisionId[];
  requestedRollbacks: string[];
  cancelledRollbacks: number;
  connection: LiveMatchConnection;
  emitSetup: (message: MatchSetupSyncMessage) => void;
  emitState: (message: MatchStateSyncMessage) => void;
  emitTimer: (message: MatchTimerSyncMessage) => void;
  emitTransition: (message: MatchSessionTransitionMessage) => void;
  emitRematchRequest: (message: MatchRematchRequestMessage) => void;
} => {
  const submittedActions: number[] = [];
  const submittedActionRequests: SubmittedActionRequest[] = [];
  const submittedDecisions: DecisionId[] = [];
  const requestedRollbacks: string[] = [];
  let onSetupSync: ((message: MatchSetupSyncMessage) => void) | undefined;
  let onStateSync: ((message: MatchStateSyncMessage) => void) | undefined;
  let onTimerSync: ((message: MatchTimerSyncMessage) => void) | undefined;
  let onSessionTransition:
    | ((message: MatchSessionTransitionMessage) => void)
    | undefined;
  let onRematchRequest:
    | ((message: MatchRematchRequestMessage) => void)
    | undefined;
  let cancelledRollbacks = 0;
  const connection: LiveMatchConnection = {
    close() {},
    submitVisibleAction(input) {
      submittedActions.push(input.actionIndex);
      submittedActionRequests.push(input);
      return Promise.resolve({
        snapshot: { stateSeq: 2, players: {} },
        cards: { players: { ["p1" as PlayerId]: { cards: {} } } },
        errors: options?.actionErrors ?? [],
      });
    },
    respondToDecision(input) {
      submittedDecisions.push(input.decisionId);
      return Promise.resolve({
        snapshot: { stateSeq: 2, players: {} },
        cards: { players: { ["p1" as PlayerId]: { cards: {} } } },
        errors: options?.decisionErrors ?? [],
      });
    },
    requestRollback(input) {
      requestedRollbacks.push(input.rollbackPointId);
      return Promise.resolve({
        snapshot: { stateSeq: 2, players: {} },
        cards: { players: { ["p1" as PlayerId]: { cards: {} } } },
        errors: options?.rollbackErrors ?? [],
      });
    },
    cancelRollback() {
      cancelledRollbacks += 1;
      return Promise.resolve({
        snapshot: { stateSeq: 2, players: {} },
        cards: { players: { ["p1" as PlayerId]: { cards: {} } } },
        errors: options?.cancelRollbackErrors ?? [],
      });
    },
  };
  return {
    submittedActions,
    submittedActionRequests,
    submittedDecisions,
    requestedRollbacks,
    get cancelledRollbacks() {
      return cancelledRollbacks;
    },
    connection,
    connect(input) {
      onSetupSync = input.onSetupSync;
      onStateSync = input.onStateSync;
      onTimerSync = input.onTimerSync;
      onSessionTransition = input.onSessionTransition;
      onRematchRequest = input.onRematchRequest;
      return connection;
    },
    emitSetup(message) {
      if (onSetupSync === undefined) {
        throw new Error("Match live transport was not connected.");
      }
      onSetupSync(message);
    },
    emitState(message) {
      if (onStateSync === undefined) {
        throw new Error("Match live transport was not connected.");
      }
      onStateSync(message);
    },
    emitTimer(message) {
      if (onTimerSync === undefined) {
        throw new Error("Match live transport was not connected.");
      }
      onTimerSync(message);
    },
    emitTransition(message) {
      if (onSessionTransition === undefined) {
        throw new Error("Match live transport was not connected.");
      }
      onSessionTransition(message);
    },
    emitRematchRequest(message) {
      if (onRematchRequest === undefined) {
        throw new Error("Match live transport was not connected.");
      }
      onRematchRequest(message);
    },
  };
};

export const createFakeLobbyLiveTransport = (): LobbyLiveTransport & {
  emit: (message: LobbyStateSyncMessage) => void;
} => {
  let onLobbySync: ((message: LobbyStateSyncMessage) => void) | undefined;
  return {
    connect(input) {
      onLobbySync = input.onLobbySync;
      return {
        close() {},
      };
    },
    emit(message) {
      if (onLobbySync === undefined) {
        throw new Error("Lobby live transport was not connected.");
      }
      onLobbySync(message);
    },
  };
};
