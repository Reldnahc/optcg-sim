import { strict as assert } from "node:assert";
import { test } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

import { createMatchClientController } from "./controller.js";
import {
  createClientSessionStore,
  createMemoryClientStorage,
} from "./session.js";
import type {
  LiveMatchConnection,
  MatchLiveTransport,
  MatchStateSyncMessage,
  MatchTransport,
} from "./transport.js";

const accountSessionToken = "user:user-1:session-1";
const matchId = "match-1" as MatchId;
const playerId = "p1" as PlayerId;

const createPendingRematchTransport = (): MatchTransport => ({
  createLobby() {
    throw new Error("createLobby was not expected.");
  },
  joinLobby() {
    throw new Error("joinLobby was not expected.");
  },
  joinLobbyByCode() {
    throw new Error("joinLobbyByCode was not expected.");
  },
  submitLobbyDeck() {
    throw new Error("submitLobbyDeck was not expected.");
  },
  submitLobbyLoadoutHandoff() {
    throw new Error("submitLobbyLoadoutHandoff was not expected.");
  },
  validateLobbyLoadouts() {
    throw new Error("validateLobbyLoadouts was not expected.");
  },
  validateLobbyDecks() {
    throw new Error("validateLobbyDecks was not expected.");
  },
  loadLobby() {
    throw new Error("loadLobby was not expected.");
  },
  createMatch() {
    return Promise.resolve({
      matchId,
      seats: {
        p1: { playerId, claimed: false },
        p2: { playerId: "p2" as PlayerId, claimed: false },
      },
      snapshot: { stateSeq: 1, players: {} },
    });
  },
  createRematch() {
    return Promise.resolve({ rematch: { status: "pending" } });
  },
  claimSeat(input) {
    return Promise.resolve({
      matchId: input.matchId,
      seat: {
        playerId: input.playerId,
        sessionToken: input.sessionToken ?? accountSessionToken,
      },
    });
  },
  claimSeatForAccount() {
    throw new Error("claimSeatForAccount was not expected.");
  },
  chooseFirstPlayer() {
    throw new Error("chooseFirstPlayer was not expected.");
  },
});

const createStateSyncLiveTransport = (): MatchLiveTransport & {
  emitState: (message: MatchStateSyncMessage) => void;
} => {
  let onStateSync: ((message: MatchStateSyncMessage) => void) | undefined;
  const connection: LiveMatchConnection = {
    close() {},
    submitVisibleAction() {
      throw new Error("submitVisibleAction was not expected.");
    },
    respondToDecision() {
      throw new Error("respondToDecision was not expected.");
    },
    requestRollback() {
      throw new Error("requestRollback was not expected.");
    },
    cancelRollback() {
      throw new Error("cancelRollback was not expected.");
    },
  };
  return {
    connect(input) {
      onStateSync = input.onStateSync;
      return connection;
    },
    emitState(message) {
      if (onStateSync === undefined) {
        throw new Error("Live transport was not connected.");
      }
      onStateSync(message);
    },
  };
};

test("pending rematch consensus keeps the current match loaded", async () => {
  const liveTransport = createStateSyncLiveTransport();
  const controller = createMatchClientController({
    accountSessionToken,
    transport: createPendingRematchTransport(),
    liveTransport,
    sessionStore: createClientSessionStore({
      storage: createMemoryClientStorage(),
    }),
  });
  await controller.startNewLocalMatch(playerId);
  controller.connectLive({ onState() {}, onError() {} });
  liveTransport.emitState({
    type: "stateSync",
    matchId,
    serverSeq: 1,
    stateSeq: 1,
    snapshot: { matchId, stateSeq: 1, players: {} },
    cards: { players: {} },
  });

  const state = await controller.requestRematch();

  assert.equal("snapshot" in state, true);
  assert.deepEqual(controller.currentCredential(), {
    matchId,
    playerId,
    sessionToken: accountSessionToken,
  });
});
