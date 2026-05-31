import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { DecisionId, MatchId, PlayerId } from "@optcg/types";

import {
  createClientSessionStore,
  createMemoryClientStorage,
} from "./session.js";
import type {
  MatchClientState,
  MatchClientSessionState,
} from "./controller.js";
import type {
  LobbyLiveTransport,
  LobbyStateSyncMessage,
  LiveMatchConnection,
  MatchLiveTransport,
  MatchTransport,
} from "./transport.js";
import { createMatchClientController } from "./controller.js";

const createFakeTransport = (): MatchTransport & {
  claimedSeats: Array<{
    matchId: MatchId;
    playerId: PlayerId;
    sessionToken?: string;
  }>;
} => {
  const claimedSeats: Array<{
    matchId: MatchId;
    playerId: PlayerId;
    sessionToken?: string;
  }> = [];
  return {
    claimedSeats,
    createLobby() {
      return Promise.resolve({
        lobbyId: "lobby-1",
        seats: {
          p1: { playerId: "p1" as PlayerId, claimed: false },
          p2: { playerId: "p2" as PlayerId, claimed: false },
        },
      });
    },
    claimLobbySeat(input) {
      return Promise.resolve({
        lobbyId: input.lobbyId,
        seats: {
          p1: { playerId: "p1" as PlayerId, claimed: true },
          p2: { playerId: "p2" as PlayerId, claimed: false },
        },
      });
    },
    loadLobby(lobbyId) {
      return Promise.resolve({
        lobbyId,
        matchId: "match-1" as MatchId,
        seats: {
          p1: { playerId: "p1" as PlayerId, claimed: true },
          p2: { playerId: "p2" as PlayerId, claimed: true },
        },
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
    loadState(matchId) {
      return Promise.resolve({ matchId, stateSeq: 1, players: {} });
    },
    loadCards() {
      return Promise.resolve({ players: {} });
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

const createFakeLiveTransport = (options?: {
  actionErrors?: string[];
  decisionErrors?: string[];
  rollbackErrors?: string[];
  cancelRollbackErrors?: string[];
}): MatchLiveTransport & {
  submittedActions: number[];
  submittedDecisions: DecisionId[];
  requestedRollbacks: string[];
  cancelledRollbacks: number;
  connection: LiveMatchConnection;
} => {
  const submittedActions: number[] = [];
  const submittedDecisions: DecisionId[] = [];
  const requestedRollbacks: string[] = [];
  let cancelledRollbacks = 0;
  const connection: LiveMatchConnection = {
    close() {},
    submitVisibleAction(input) {
      submittedActions.push(input.actionIndex);
      return Promise.resolve({
        snapshot: { stateSeq: 2, players: {} },
        errors: options?.actionErrors ?? [],
      });
    },
    respondToDecision(input) {
      submittedDecisions.push(input.decisionId);
      return Promise.resolve({
        snapshot: { stateSeq: 2, players: {} },
        errors: options?.decisionErrors ?? [],
      });
    },
    requestRollback(input) {
      requestedRollbacks.push(input.rollbackPointId);
      return Promise.resolve({
        snapshot: { stateSeq: 2, players: {} },
        errors: options?.rollbackErrors ?? [],
      });
    },
    cancelRollback() {
      cancelledRollbacks += 1;
      return Promise.resolve({
        snapshot: { stateSeq: 2, players: {} },
        errors: options?.cancelRollbackErrors ?? [],
      });
    },
  };
  return {
    submittedActions,
    submittedDecisions,
    requestedRollbacks,
    get cancelledRollbacks() {
      return cancelledRollbacks;
    },
    connection,
    connect() {
      return connection;
    },
  };
};

const createFakeLobbyLiveTransport = (): LobbyLiveTransport & {
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

const requireMatchClientState = (
  state: MatchClientSessionState,
): MatchClientState => {
  if (!("snapshot" in state)) {
    throw new Error("Expected loaded match client state.");
  }
  return state;
};

describe("match client controller", () => {
  test("starts a local match by creating, claiming, and loading data", async () => {
    const transport = createFakeTransport();
    const controller = createMatchClientController({
      transport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    const state = requireMatchClientState(
      await controller.startNewLocalMatch("p1" as PlayerId),
    );

    assert.equal(state.matchId, "match-1");
    assert.deepEqual(state.seat, {
      matchId: "match-1",
      playerId: "p1",
    });
    assert.deepEqual(controller.currentCredential(), {
      matchId: "match-1",
      playerId: "p1",
      sessionToken: "token-p1",
    });
  });

  test("returns first-player setup state and resolves it before loading the match", async () => {
    const transport = createFakeTransport();
    transport.createMatch = () =>
      Promise.resolve({
        matchId: "match-1" as MatchId,
        seats: {
          p1: { playerId: "p1" as PlayerId, claimed: false },
          p2: { playerId: "p2" as PlayerId, claimed: false },
        },
        firstPlayerChoice: {
          chooserPlayerId: "p1" as PlayerId,
          choices: ["goFirst", "goSecond"],
        },
      });
    transport.claimSeat = (input) => {
      transport.claimedSeats.push(input);
      return Promise.resolve({
        matchId: input.matchId,
        seat: {
          playerId: input.playerId,
          sessionToken: input.sessionToken ?? `token-${String(input.playerId)}`,
        },
        firstPlayerChoice: {
          chooserPlayerId: "p1" as PlayerId,
          choices: ["goFirst", "goSecond"],
        },
      });
    };
    const controller = createMatchClientController({
      transport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    const setup = await controller.startNewLocalMatch("p1" as PlayerId);

    assert.equal("firstPlayerChoice" in setup, true);
    const match = await controller.chooseFirstPlayer({ choice: "goFirst" });

    assert.equal(match.matchId, "match-1");
    assert.equal(match.snapshot.stateSeq, 1);
  });

  test("joins an existing local match by claiming only the requested seat", async () => {
    const transport = createFakeTransport();
    const controller = createMatchClientController({
      transport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    const state = requireMatchClientState(
      await controller.joinLocalMatch({
        matchId: "match-2" as MatchId,
        playerId: "p2" as PlayerId,
      }),
    );

    assert.equal(state.matchId, "match-2");
    assert.deepEqual(controller.currentCredential(), {
      matchId: "match-2",
      playerId: "p2",
      sessionToken: "token-p2",
    });
  });

  test("claims and loads the match when a waiting lobby becomes ready", async () => {
    const transport = createFakeTransport();
    const lobbyLiveTransport = createFakeLobbyLiveTransport();
    const controller = createMatchClientController({
      transport,
      lobbyLiveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    const initial = await controller.startNewLocalLobby("p1" as PlayerId);
    assert.equal("lobbyId" in initial, true);

    const readyStatePromise = new Promise<MatchClientSessionState>(
      (resolve, reject) => {
        controller.connectLobbyLive({
          onState: resolve,
          onError: reject,
        });
      },
    );
    lobbyLiveTransport.emit({
      type: "lobbySync",
      lobbyId: "lobby-1",
      serverSeq: 1,
      lobby: {
        lobbyId: "lobby-1",
        matchId: "match-1" as MatchId,
        seats: {
          p1: { playerId: "p1" as PlayerId, claimed: true },
          p2: { playerId: "p2" as PlayerId, claimed: true },
        },
      },
    });

    const readyState = await readyStatePromise;

    assert.equal("matchId" in readyState, true);
    assert.deepEqual(transport.claimedSeats, [
      { matchId: "match-1", playerId: "p1" },
    ]);
    assert.deepEqual(controller.currentCredential(), {
      matchId: "match-1",
      playerId: "p1",
      sessionToken: "token-p1",
    });
  });

  test("refuses to submit actions before a seat is claimed", async () => {
    const controller = createMatchClientController({
      transport: createFakeTransport(),
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await assert.rejects(
      () => controller.submitVisibleAction({ actionIndex: 0 }),
      /Cannot submit an action before claiming a seat/u,
    );
  });

  test("submits gameplay actions through the live connection", async () => {
    const liveTransport = createFakeLiveTransport();
    const controller = createMatchClientController({
      transport: createFakeTransport(),
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);
    controller.connectLive({ onState() {}, onError() {} });
    await controller.submitVisibleAction({ actionIndex: 0 });

    assert.deepEqual(liveTransport.submittedActions, [0]);
  });

  test("does not fall back to HTTP gameplay when live transport is configured but disconnected", async () => {
    const transport = createFakeTransport();
    const liveTransport: MatchLiveTransport = {
      connect() {
        throw new Error("Live connection was not expected.");
      },
    };
    const controller = createMatchClientController({
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);

    await assert.rejects(
      () => controller.submitVisibleAction({ actionIndex: 0 }),
      /Live match connection is not active/u,
    );
  });

  test("does not fall back to HTTP decisions when live transport is configured but disconnected", async () => {
    const transport = createFakeTransport();
    const liveTransport: MatchLiveTransport = {
      connect() {
        throw new Error("Live connection was not expected.");
      },
    };
    const controller = createMatchClientController({
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);

    await assert.rejects(
      () =>
        controller.respondToDecision({
          decisionId: "decision-1" as DecisionId,
          response: { type: "mulligan", keep: true },
        }),
      /Live match connection is not active/u,
    );
  });

  test("revalidates an existing seat credential when joining a match", async () => {
    const transport = createFakeTransport();
    const sessionStore = createClientSessionStore({
      storage: createMemoryClientStorage(),
    });
    sessionStore.saveClaimedSeat({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      sessionToken: "existing-token-p1",
    });
    const controller = createMatchClientController({
      transport,
      sessionStore,
    });

    await controller.joinLocalMatch({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
    });

    assert.deepEqual(transport.claimedSeats, [
      {
        matchId: "match-1",
        playerId: "p1",
        sessionToken: "existing-token-p1",
      },
    ]);
    assert.deepEqual(controller.currentCredential(), {
      matchId: "match-1",
      playerId: "p1",
      sessionToken: "existing-token-p1",
    });
  });

  test("rejects server-side decision errors instead of treating them as success", async () => {
    const liveTransport = createFakeLiveTransport({
      decisionErrors: ["Unsupported decision type."],
    });
    const controller = createMatchClientController({
      transport: createFakeTransport(),
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);
    controller.connectLive({ onState() {}, onError() {} });

    await assert.rejects(
      () =>
        controller.respondToDecision({
          decisionId: "decision-1" as DecisionId,
          response: { type: "mulligan", keep: true },
        }),
      /Unsupported decision type\./u,
    );
  });

  test("requests rollback through the live connection", async () => {
    const liveTransport = createFakeLiveTransport();
    const controller = createMatchClientController({
      transport: createFakeTransport(),
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);
    controller.connectLive({ onState() {}, onError() {} });
    await controller.requestRollback({ rollbackPointId: "rollback:1" });

    assert.deepEqual(liveTransport.requestedRollbacks, ["rollback:1"]);
  });

  test("cancels rollback through the live connection", async () => {
    const liveTransport = createFakeLiveTransport();
    const controller = createMatchClientController({
      transport: createFakeTransport(),
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);
    controller.connectLive({ onState() {}, onError() {} });
    await controller.cancelRollback();

    assert.equal(liveTransport.cancelledRollbacks, 1);
  });
});
