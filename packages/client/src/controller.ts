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
  CreateCustomLobbyInput,
  FirstPlayerChoiceValue,
  FirstPlayerChoiceView,
  LiveLobbyConnection,
  CustomLobby,
  LobbyLiveTransport,
  LobbyStateSyncMessage,
  MatchCardCatalog,
  MatchLiveTransport,
  MatchSnapshot,
  MatchTransport,
  LiveMatchConnection,
  ValidatedLobbyLoadouts,
} from "./transport.js";

export interface LobbyClientState {
  lobbyId: string;
  seat: {
    lobbyId: string;
    playerId: PlayerId;
    sessionToken: string;
  };
  lobby: CustomLobby;
}

export interface MatchClientState {
  matchId: MatchId;
  seat: ClientSeatIdentity;
  snapshot: MatchSnapshot;
  cards: MatchCardCatalog;
}

export interface HydratingMatchClientState {
  matchId: MatchId;
  seat: ClientSeatIdentity;
}

export interface FirstPlayerSetupClientState {
  matchId: MatchId;
  seat: ClientSeatIdentity;
  firstPlayerChoice: FirstPlayerChoiceView;
}

export type MatchClientSessionState =
  | LobbyClientState
  | HydratingMatchClientState
  | FirstPlayerSetupClientState
  | MatchClientState;

export interface MatchClientController {
  startCustomLobby: (
    input?: CreateCustomLobbyInput,
  ) => Promise<MatchClientSessionState>;
  joinCustomLobby: (input: {
    lobbyId: string;
  }) => Promise<MatchClientSessionState>;
  submitLobbyLoadoutHandoff: (input: {
    handoffToken: string;
  }) => Promise<MatchClientSessionState>;
  submitLobbyDeck: (input: {
    deckHash: string;
    donDeckCount: number;
  }) => Promise<MatchClientSessionState>;
  validateLobbyLoadouts: (input: {
    handoffTokens: readonly string[];
  }) => Promise<ValidatedLobbyLoadouts>;
  validateLobbyDecks: (input: {
    decks: readonly {
      loadoutId: string;
      deckHash: string;
      donDeckCount: number;
    }[];
  }) => Promise<ValidatedLobbyLoadouts>;
  startNewLocalMatch: (playerId: PlayerId) => Promise<MatchClientSessionState>;
  joinLocalMatch: (
    input: ClientSeatIdentity,
  ) => Promise<MatchClientSessionState>;
  joinLocalMatchByAccount: (input: {
    matchId: MatchId;
  }) => Promise<MatchClientSessionState>;
  requestRematch: () => Promise<MatchClientSessionState>;
  chooseFirstPlayer: (input: {
    choice: FirstPlayerChoiceValue;
  }) => Promise<MatchClientSessionState>;
  refresh: () => Promise<MatchClientSessionState>;
  submitVisibleAction: (input: {
    actionIndex: number;
  }) => Promise<MatchClientState>;
  respondToDecision: (input: {
    decisionId: DecisionId;
    response: DecisionResponse;
  }) => Promise<MatchClientState>;
  requestRollback: (input: {
    rollbackPointId: string;
  }) => Promise<MatchClientState>;
  cancelRollback: () => Promise<MatchClientState>;
  connectLive: (input: {
    onState: (state: MatchClientSessionState) => void;
    onError: (message: string) => void;
  }) => void;
  disconnectLive: () => void;
  connectLobbyLive: (input: {
    onState: (state: MatchClientSessionState) => void;
    onError: (message: string) => void;
  }) => void;
  disconnectLobbyLive: () => void;
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

const requireCurrentState = (
  currentState: MatchClientState | undefined,
): MatchClientState => {
  if (currentState === undefined) {
    throw new Error("Cannot submit a live action before loading match state.");
  }
  return currentState;
};

const isJoinedCustomLobby = (
  value: Awaited<ReturnType<MatchTransport["createRematch"]>>,
): value is CustomLobby & { seat: { playerId: PlayerId } } =>
  "lobbyId" in value && "seat" in value;

export const createMatchClientController = ({
  transport,
  liveTransport,
  lobbyLiveTransport,
  accountSessionToken,
  sessionStore,
}: {
  transport: MatchTransport;
  liveTransport?: MatchLiveTransport;
  lobbyLiveTransport?: LobbyLiveTransport;
  accountSessionToken: string;
  sessionStore: ClientSessionStore;
}): MatchClientController => {
  let currentState: MatchClientState | undefined;
  let currentFirstPlayerSetupState: FirstPlayerSetupClientState | undefined;
  let currentLobbyState: LobbyClientState | undefined;
  let liveConnection: LiveMatchConnection | undefined;
  let lobbyLiveConnection: LiveLobbyConnection | undefined;

  const disconnectLobbyConnection = (): void => {
    lobbyLiveConnection?.close();
    lobbyLiveConnection = undefined;
  };

  const waitForSocketState = (
    seat: ClientSeatIdentity,
  ): HydratingMatchClientState => {
    const hydratingState = {
      matchId: seat.matchId,
      seat,
    };
    currentState = undefined;
    currentFirstPlayerSetupState = undefined;
    currentLobbyState = undefined;
    disconnectLobbyConnection();
    return hydratingState;
  };

  const loadSetupState = (
    seat: ClientSeatIdentity,
    firstPlayerChoice: FirstPlayerChoiceView,
  ): FirstPlayerSetupClientState => {
    currentState = undefined;
    currentFirstPlayerSetupState = {
      matchId: seat.matchId,
      seat,
      firstPlayerChoice,
    };
    currentLobbyState = undefined;
    disconnectLobbyConnection();
    return currentFirstPlayerSetupState;
  };

  const claimAndLoad = async (
    seat: ClientSeatIdentity,
    sessionToken?: string,
  ): Promise<MatchClientSessionState> => {
    const existingSessionToken = sessionToken ?? accountSessionToken;
    sessionStore.setCurrentSeat(seat);
    const claimed = await transport.claimSeat({
      ...seat,
      sessionToken: existingSessionToken,
    });
    sessionStore.saveClaimedSeat({
      matchId: claimed.matchId,
      playerId: claimed.seat.playerId,
      sessionToken: claimed.seat.sessionToken,
    });
    if (claimed.firstPlayerChoice !== undefined) {
      return loadSetupState(seat, claimed.firstPlayerChoice);
    }
    return waitForSocketState(seat);
  };

  const claimMatchIfReady = async (
    lobbyState: LobbyClientState,
  ): Promise<MatchClientSessionState> => {
    const matchId = lobbyState.lobby.matchId;
    if (matchId === undefined) {
      currentLobbyState = lobbyState;
      return lobbyState;
    }
    return claimAndLoad(
      { matchId, playerId: lobbyState.seat.playerId },
      lobbyState.seat.sessionToken,
    );
  };

  return {
    async startCustomLobby(input = {}) {
      const lobby = await transport.createLobby(input);
      const joinedLobby = await transport.joinLobby({
        lobbyId: lobby.lobbyId,
        sessionToken: accountSessionToken,
      });
      return claimMatchIfReady({
        lobbyId: joinedLobby.lobbyId,
        seat: {
          lobbyId: joinedLobby.lobbyId,
          playerId: joinedLobby.seat.playerId,
          sessionToken: accountSessionToken,
        },
        lobby: joinedLobby,
      });
    },
    async joinCustomLobby(input) {
      const joinedLobby = await transport.joinLobby({
        lobbyId: input.lobbyId,
        sessionToken: accountSessionToken,
      });
      return claimMatchIfReady({
        lobbyId: joinedLobby.lobbyId,
        seat: {
          lobbyId: joinedLobby.lobbyId,
          playerId: joinedLobby.seat.playerId,
          sessionToken: accountSessionToken,
        },
        lobby: joinedLobby,
      });
    },
    async submitLobbyLoadoutHandoff(input) {
      if (currentLobbyState === undefined) {
        throw new Error("Cannot submit a loadout before joining a lobby.");
      }
      const lobby = await transport.submitLobbyLoadoutHandoff({
        lobbyId: currentLobbyState.lobbyId,
        handoffToken: input.handoffToken,
      });
      return claimMatchIfReady({
        lobbyId: lobby.lobbyId,
        seat: {
          lobbyId: lobby.lobbyId,
          playerId: lobby.seat.playerId,
          sessionToken:
            lobby.seat.sessionToken ??
            sessionStore.loadClaimedSeat()?.sessionToken ??
            currentLobbyState.seat.sessionToken,
        },
        lobby,
      });
    },
    async submitLobbyDeck(input) {
      if (currentLobbyState === undefined) {
        throw new Error("Cannot submit a deck before joining a lobby.");
      }
      const lobby = await transport.submitLobbyDeck({
        lobbyId: currentLobbyState.lobbyId,
        sessionToken: currentLobbyState.seat.sessionToken,
        deckHash: input.deckHash,
        donDeckCount: input.donDeckCount,
      });
      return claimMatchIfReady({
        ...currentLobbyState,
        lobby,
      });
    },
    async validateLobbyLoadouts(input) {
      if (currentLobbyState === undefined) {
        throw new Error("Cannot validate loadouts before joining a lobby.");
      }
      return transport.validateLobbyLoadouts({
        lobbyId: currentLobbyState.lobbyId,
        handoffTokens: input.handoffTokens,
      });
    },
    async validateLobbyDecks(input) {
      if (currentLobbyState === undefined) {
        throw new Error("Cannot validate decks before joining a lobby.");
      }
      return transport.validateLobbyDecks({
        lobbyId: currentLobbyState.lobbyId,
        decks: input.decks,
      });
    },
    async startNewLocalMatch(playerId) {
      const created = await transport.createMatch();
      const seat = { matchId: created.matchId, playerId };
      sessionStore.setCurrentSeat(seat);
      const claimed = await transport.claimSeat({
        ...seat,
        sessionToken: accountSessionToken,
      });
      sessionStore.saveClaimedSeat({
        matchId: claimed.matchId,
        playerId: claimed.seat.playerId,
        sessionToken: claimed.seat.sessionToken,
      });
      if (created.snapshot === undefined) {
        const firstPlayerChoice = created.firstPlayerChoice;
        if (firstPlayerChoice === undefined) {
          throw new Error(
            "Created match did not include snapshot or setup choice.",
          );
        }
        return loadSetupState(seat, firstPlayerChoice);
      }
      return waitForSocketState(seat);
    },
    joinLocalMatch(input) {
      return claimAndLoad(input);
    },
    async joinLocalMatchByAccount(input) {
      const claimed = await transport.claimSeatForAccount({
        matchId: input.matchId,
        sessionToken: accountSessionToken,
      });
      sessionStore.saveClaimedSeat({
        matchId: claimed.matchId,
        playerId: claimed.seat.playerId,
        sessionToken: claimed.seat.sessionToken,
      });
      const seat = {
        matchId: claimed.matchId,
        playerId: claimed.seat.playerId,
      };
      if (claimed.firstPlayerChoice !== undefined) {
        return loadSetupState(seat, claimed.firstPlayerChoice);
      }
      return waitForSocketState(seat);
    },
    async requestRematch() {
      const credential = sessionStore.loadClaimedSeat();
      if (credential === undefined) {
        throw new Error(
          "Cannot request a rematch before claiming a match seat.",
        );
      }
      const created = await transport.createRematch({
        matchId: credential.matchId,
        playerId: credential.playerId,
        sessionToken: credential.sessionToken,
      });
      if (isJoinedCustomLobby(created)) {
        currentState = undefined;
        currentFirstPlayerSetupState = undefined;
        currentLobbyState = {
          lobbyId: created.lobbyId,
          seat: {
            lobbyId: created.lobbyId,
            playerId: created.seat.playerId,
            sessionToken: credential.sessionToken,
          },
          lobby: created,
        };
        return currentLobbyState;
      }
      const seat = {
        matchId: created.matchId,
        playerId: credential.playerId,
      };
      const claimed = await transport.claimSeat({
        ...seat,
        sessionToken: credential.sessionToken,
      });
      sessionStore.setCurrentSeat(seat);
      sessionStore.saveClaimedSeat({
        matchId: claimed.matchId,
        playerId: claimed.seat.playerId,
        sessionToken: claimed.seat.sessionToken,
      });
      if (created.snapshot === undefined) {
        const firstPlayerChoice =
          created.firstPlayerChoice ?? claimed.firstPlayerChoice;
        if (firstPlayerChoice === undefined) {
          throw new Error("Rematch did not include snapshot or setup choice.");
        }
        return loadSetupState(seat, firstPlayerChoice);
      }
      return waitForSocketState(seat);
    },
    async chooseFirstPlayer(input) {
      const setupState = currentFirstPlayerSetupState;
      if (setupState === undefined) {
        throw new Error("Cannot choose first or second before setup starts.");
      }
      const result = await transport.chooseFirstPlayer({
        matchId: setupState.matchId,
        playerId: setupState.seat.playerId,
        choice: input.choice,
      });
      if (result.snapshot === undefined) {
        throw new Error("First-player choice did not start the match.");
      }
      return waitForSocketState(setupState.seat);
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
          if (
            currentState !== undefined &&
            message.stateSeq < currentState.snapshot.stateSeq
          ) {
            return;
          }
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
        onTimerSync(message) {
          if (
            currentState === undefined ||
            currentState.matchId !== message.matchId
          ) {
            return;
          }
          currentState = {
            ...currentState,
            snapshot: {
              ...currentState.snapshot,
              stateSeq: message.stateSeq,
              players: Object.fromEntries(
                Object.entries(currentState.snapshot.players).map(
                  ([playerId, player]) => [
                    playerId,
                    {
                      ...player,
                      view: {
                        ...player.view,
                        timers: message.timers,
                      },
                    },
                  ],
                ),
              ),
            },
          };
          onState(currentState);
        },
        onSetupSync(message) {
          onState(
            loadSetupState(
              { matchId: message.matchId, playerId: credential.playerId },
              message.firstPlayerChoice,
            ),
          );
        },
        onSessionTransition(message) {
          const transition =
            message.nextLobbyId === undefined
              ? message.nextMatchId === undefined
                ? Promise.reject(
                    new Error("Session transition did not include a target."),
                  )
                : claimAndLoad(
                    {
                      matchId: message.nextMatchId,
                      playerId: credential.playerId,
                    },
                    credential.sessionToken,
                  )
              : transport
                  .joinLobby({
                    lobbyId: message.nextLobbyId,
                    sessionToken: credential.sessionToken,
                  })
                  .then((joinedLobby) =>
                    claimMatchIfReady({
                      lobbyId: joinedLobby.lobbyId,
                      seat: {
                        lobbyId: joinedLobby.lobbyId,
                        playerId: joinedLobby.seat.playerId,
                        sessionToken: credential.sessionToken,
                      },
                      lobby: joinedLobby,
                    }),
                  );
          void transition.then(onState).catch((error: unknown) => {
            onError(error instanceof Error ? error.message : String(error));
          });
        },
      });
    },
    disconnectLive() {
      liveConnection?.close();
      liveConnection = undefined;
    },
    connectLobbyLive({ onState, onError }) {
      if (
        currentLobbyState === undefined ||
        lobbyLiveTransport === undefined ||
        lobbyLiveConnection !== undefined
      ) {
        return;
      }
      const lobbyId = currentLobbyState.lobbyId;
      const playerId = currentLobbyState.seat.playerId;
      const lobbySessionToken = currentLobbyState.seat.sessionToken;
      const toLobbyState = (
        message: LobbyStateSyncMessage,
      ): LobbyClientState => ({
        lobbyId: message.lobbyId,
        seat: {
          lobbyId: message.lobbyId,
          playerId,
          sessionToken: lobbySessionToken,
        },
        lobby: message.lobby,
      });
      lobbyLiveConnection = lobbyLiveTransport.connect({
        lobbyId,
        playerId,
        sessionToken: lobbySessionToken,
        onError,
        onLobbySync(message) {
          if (message.lobbyId !== lobbyId) {
            return;
          }
          void claimMatchIfReady(toLobbyState(message))
            .then(onState)
            .catch((error: unknown) => {
              onError(error instanceof Error ? error.message : String(error));
            });
        },
      });
    },
    disconnectLobbyLive() {
      disconnectLobbyConnection();
    },
    async refresh() {
      if (currentLobbyState !== undefined) {
        const lobby = await transport.loadLobby(currentLobbyState.lobbyId);
        return claimMatchIfReady({
          ...currentLobbyState,
          lobby,
        });
      }
      if (currentFirstPlayerSetupState !== undefined) {
        return currentFirstPlayerSetupState;
      }
      const seat = sessionStore.loadCurrentSeat();
      if (seat === undefined) {
        throw new Error("Cannot refresh a match before selecting a seat.");
      }
      return waitForSocketState(seat);
    },
    async submitVisibleAction(input) {
      const credential = requireCredential(sessionStore);
      const previousState = requireCurrentState(currentState);
      const snapshot = previousState.snapshot;
      const transportInput = {
        matchId: credential.matchId,
        playerId: credential.playerId,
        actionIndex: input.actionIndex,
        expectedStateSeq: snapshot.stateSeq,
      };
      const result =
        await requireLiveConnection(liveConnection).submitVisibleAction(
          transportInput,
        );
      throwIfActionResultFailed(result.errors);
      currentState = {
        matchId: credential.matchId,
        seat: {
          matchId: credential.matchId,
          playerId: credential.playerId,
        },
        snapshot: result.snapshot,
        cards: result.cards,
      };
      return currentState;
    },
    async respondToDecision(input) {
      const credential = requireCredential(sessionStore);
      const previousState = requireCurrentState(currentState);
      const snapshot = previousState.snapshot;
      const transportInput = {
        matchId: credential.matchId,
        playerId: credential.playerId,
        decisionId: input.decisionId,
        expectedStateSeq: snapshot.stateSeq,
        expectedDecisionId: input.decisionId,
        response: input.response,
      };
      const result =
        await requireLiveConnection(liveConnection).respondToDecision(
          transportInput,
        );
      throwIfActionResultFailed(result.errors);
      currentState = {
        matchId: credential.matchId,
        seat: {
          matchId: credential.matchId,
          playerId: credential.playerId,
        },
        snapshot: result.snapshot,
        cards: result.cards,
      };
      return currentState;
    },
    async requestRollback(input) {
      const credential = requireCredential(sessionStore);
      const previousState = requireCurrentState(currentState);
      const snapshot = previousState.snapshot;
      const transportInput = {
        matchId: credential.matchId,
        playerId: credential.playerId,
        rollbackPointId: input.rollbackPointId,
        expectedStateSeq: snapshot.stateSeq,
      };
      const result =
        await requireLiveConnection(liveConnection).requestRollback(
          transportInput,
        );
      throwIfActionResultFailed(result.errors);
      currentState = {
        matchId: credential.matchId,
        seat: {
          matchId: credential.matchId,
          playerId: credential.playerId,
        },
        snapshot: result.snapshot,
        cards: result.cards,
      };
      return currentState;
    },
    async cancelRollback() {
      const credential = requireCredential(sessionStore);
      const previousState = requireCurrentState(currentState);
      const snapshot = previousState.snapshot;
      const transportInput = {
        matchId: credential.matchId,
        playerId: credential.playerId,
        expectedStateSeq: snapshot.stateSeq,
      };
      const result =
        await requireLiveConnection(liveConnection).cancelRollback(
          transportInput,
        );
      throwIfActionResultFailed(result.errors);
      currentState = {
        matchId: credential.matchId,
        seat: {
          matchId: credential.matchId,
          playerId: credential.playerId,
        },
        snapshot: result.snapshot,
        cards: result.cards,
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
