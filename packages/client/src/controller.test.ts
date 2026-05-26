import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { DecisionId, MatchId, PlayerId } from "@optcg/types";

import {
  createClientSessionStore,
  createMemoryClientStorage,
} from "./session.js";
import type {
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
  };
};

const createFakeLiveTransport = (options?: {
  actionErrors?: string[];
  decisionErrors?: string[];
}): MatchLiveTransport & {
  submittedActions: number[];
  submittedDecisions: DecisionId[];
  connection: LiveMatchConnection;
} => {
  const submittedActions: number[] = [];
  const submittedDecisions: DecisionId[] = [];
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
  };
  return {
    submittedActions,
    submittedDecisions,
    connection,
    connect() {
      return connection;
    },
  };
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

    const state = await controller.startNewLocalMatch("p1" as PlayerId);

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

  test("joins an existing local match by claiming only the requested seat", async () => {
    const transport = createFakeTransport();
    const controller = createMatchClientController({
      transport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    const state = await controller.joinLocalMatch({
      matchId: "match-2" as MatchId,
      playerId: "p2" as PlayerId,
    });

    assert.equal(state.matchId, "match-2");
    assert.deepEqual(controller.currentCredential(), {
      matchId: "match-2",
      playerId: "p2",
      sessionToken: "token-p2",
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
});
