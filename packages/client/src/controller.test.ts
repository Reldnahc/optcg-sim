import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

import {
  createClientSessionStore,
  createMemoryClientStorage,
} from "./session.js";
import type { MatchTransport } from "./transport.js";
import { createMatchClientController } from "./controller.js";

const createFakeTransport = (): MatchTransport & {
  submittedTokens: string[];
} => {
  const submittedTokens: string[] = [];
  return {
    submittedTokens,
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
      return Promise.resolve({
        matchId: input.matchId,
        seat: {
          playerId: input.playerId,
          sessionToken: `token-${String(input.playerId)}`,
        },
      });
    },
    loadState(matchId) {
      return Promise.resolve({ matchId, stateSeq: 1, players: {} });
    },
    loadCards() {
      return Promise.resolve({ players: {} });
    },
    submitVisibleAction(input) {
      submittedTokens.push(input.sessionToken);
      return Promise.resolve({
        snapshot: { stateSeq: 2, players: {} },
        errors: [],
      });
    },
    respondToDecision(input) {
      submittedTokens.push(input.sessionToken);
      return Promise.resolve({
        snapshot: { stateSeq: 2, players: {} },
        errors: [],
      });
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

  test("submits actions with the claimed seat token", async () => {
    const transport = createFakeTransport();
    const controller = createMatchClientController({
      transport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);
    await controller.submitVisibleAction({ actionIndex: 0 });

    assert.deepEqual(transport.submittedTokens, ["token-p1"]);
  });
});
