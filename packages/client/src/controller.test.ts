import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { DecisionId, InstanceId, MatchId, PlayerId } from "@optcg/types";

import {
  createClientSessionStore,
  createMemoryClientStorage,
} from "./session.js";
import type {
  HydratingMatchClientState,
  MatchClientSessionState,
} from "./controller.js";
import { createMatchClientController } from "./controller.js";
import type { MatchStateSyncMessage } from "./transport.js";
import {
  accountSessionToken,
  createFakeLiveTransport,
  createFakeLobbyLiveTransport,
  createFakeTransport,
  playerTwoAccountSessionToken,
} from "./controller-test-support.js";

const requireHydratingMatchClientState = (
  state: MatchClientSessionState,
): HydratingMatchClientState => {
  if (!("matchId" in state) || "snapshot" in state) {
    throw new Error("Expected hydrating match client state.");
  }
  return state;
};

const flushAsyncCallbacks = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

const emitLoadedMatchState = (
  liveTransport: ReturnType<typeof createFakeLiveTransport>,
): void => {
  liveTransport.emitState({
    type: "stateSync",
    matchId: "match-1" as MatchId,
    serverSeq: 1,
    stateSeq: 1,
    snapshot: { matchId: "match-1" as MatchId, stateSeq: 1, players: {} },
    cards: { players: {} },
  });
};

describe("match client controller", () => {
  test("starts a local match by creating, claiming, and waiting for live data", async () => {
    const transport = createFakeTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    const state = requireHydratingMatchClientState(
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
      sessionToken: accountSessionToken,
    });
  });

  test("returns first-player setup state and resolves it before live loading the match", async () => {
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
      accountSessionToken,
      transport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    const setup = await controller.startNewLocalMatch("p1" as PlayerId);

    assert.equal("firstPlayerChoice" in setup, true);
    const match = requireHydratingMatchClientState(
      await controller.chooseFirstPlayer({ choice: "goFirst" }),
    );

    assert.equal(match.matchId, "match-1");
    assert.deepEqual(match.seat, {
      matchId: "match-1",
      playerId: "p1",
    });
  });

  test("requests rematch and moves to a deck-selection lobby with the existing token", async () => {
    const transport = createFakeTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });
    await controller.startNewLocalMatch("p1" as PlayerId);

    const rematch = await controller.requestRematch();

    assert.equal("lobbyId" in rematch, true);
    if (!("lobbyId" in rematch)) {
      throw new Error("Expected rematch lobby state.");
    }
    assert.equal(rematch.lobbyId, "match-1-rematch-lobby-1");
    assert.deepEqual(rematch.seat, {
      lobbyId: "match-1-rematch-lobby-1",
      playerId: "p1",
      sessionToken: accountSessionToken,
    });
    assert.deepEqual(controller.currentCredential(), {
      matchId: "match-1",
      playerId: "p1",
      sessionToken: accountSessionToken,
    });
  });

  test("live rematch transitions join the rematch lobby with the existing token", async () => {
    const transport = createFakeTransport();
    const liveTransport = createFakeLiveTransport();
    const controller = createMatchClientController({
      accountSessionToken: playerTwoAccountSessionToken,
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });
    await controller.startNewLocalMatch("p2" as PlayerId);
    const states: MatchClientSessionState[] = [];
    controller.connectLive({
      onState(state) {
        states.push(state);
      },
      onError(message) {
        throw new Error(message);
      },
    });

    liveTransport.emitTransition({
      type: "sessionTransition",
      matchId: "match-1" as MatchId,
      serverSeq: 2,
      nextLobbyId: "match-1-rematch-lobby-1",
    });
    await flushAsyncCallbacks();

    const rematch = states.at(-1);
    assert.equal(rematch !== undefined && "lobbyId" in rematch, true);
    assert.deepEqual(transport.joinedLobbies.at(-1), {
      lobbyId: "match-1-rematch-lobby-1",
      sessionToken: playerTwoAccountSessionToken,
    });
    assert.deepEqual(controller.currentCredential(), {
      matchId: "match-1",
      playerId: "p2",
      sessionToken: playerTwoAccountSessionToken,
    });
  });

  test("live setup connections accept the resolved match state", async () => {
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
    const liveTransport = createFakeLiveTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });
    await controller.startNewLocalMatch("p2" as PlayerId);
    const states: MatchClientSessionState[] = [];
    controller.connectLive({
      onState(state) {
        states.push(state);
      },
      onError(message) {
        throw new Error(message);
      },
    });

    liveTransport.emitState({
      type: "stateSync",
      matchId: "match-1" as MatchId,
      serverSeq: 2,
      stateSeq: 1,
      snapshot: { matchId: "match-1" as MatchId, stateSeq: 1, players: {} },
      cards: { players: {} },
    });

    const match = states.at(-1);
    assert.equal(match !== undefined && "snapshot" in match, true);
  });

  test("first-player choice does not overwrite live match state with hydration when socket wins the race", async () => {
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
    let resolveChoice:
      | ((
          value: Awaited<ReturnType<typeof transport.chooseFirstPlayer>>,
        ) => void)
      | undefined;
    transport.chooseFirstPlayer = () =>
      new Promise((resolve) => {
        resolveChoice = resolve;
      });
    const liveTransport = createFakeLiveTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });
    await controller.startNewLocalMatch("p1" as PlayerId);
    const states: MatchClientSessionState[] = [];
    controller.connectLive({
      onState(state) {
        states.push(state);
      },
      onError(message) {
        throw new Error(message);
      },
    });

    const choice = controller.chooseFirstPlayer({ choice: "goFirst" });
    liveTransport.emitState({
      type: "stateSync",
      matchId: "match-1" as MatchId,
      serverSeq: 2,
      stateSeq: 1,
      snapshot: { matchId: "match-1" as MatchId, stateSeq: 1, players: {} },
      cards: { players: {} },
    });
    resolveChoice?.({
      matchId: "match-1" as MatchId,
      firstPlayerChoice: {
        chooserPlayerId: "p1" as PlayerId,
        choices: ["goFirst", "goSecond"],
        resolvedFirstPlayerId: "p1" as PlayerId,
      },
      snapshot: { matchId: "match-1" as MatchId, stateSeq: 1, players: {} },
    });

    const result = await choice;
    const latestState = states.at(-1);

    assert.equal(latestState !== undefined && "snapshot" in latestState, true);
    assert.equal("snapshot" in result, true);
  });

  test("stale setup sync does not downgrade loaded match state", async () => {
    const transport = createFakeTransport();
    const liveTransport = createFakeLiveTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });
    await controller.startNewLocalMatch("p1" as PlayerId);
    const states: MatchClientSessionState[] = [];
    controller.connectLive({
      onState(state) {
        states.push(state);
      },
      onError(message) {
        throw new Error(message);
      },
    });
    emitLoadedMatchState(liveTransport);

    liveTransport.emitSetup({
      type: "setupSync",
      matchId: "match-1" as MatchId,
      serverSeq: 2,
      firstPlayerChoice: {
        chooserPlayerId: "p1" as PlayerId,
        choices: ["goFirst", "goSecond"],
      },
    });

    assert.equal(states.length, 1);
    assert.equal(controller.currentState()?.snapshot.stateSeq, 1);
  });

  test("refresh does not downgrade loaded match state to hydration", async () => {
    const transport = createFakeTransport();
    const liveTransport = createFakeLiveTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });
    await controller.startNewLocalMatch("p1" as PlayerId);
    controller.connectLive({
      onState() {},
      onError(message) {
        throw new Error(message);
      },
    });
    emitLoadedMatchState(liveTransport);

    const refreshed = await controller.refresh();

    assert.equal("snapshot" in refreshed, true);
    assert.equal(controller.currentState()?.snapshot.stateSeq, 1);
  });

  test("live timer sync updates timers without replacing cards", async () => {
    const transport = createFakeTransport();
    const liveTransport = createFakeLiveTransport();
    const p1Id = "p1" as PlayerId;
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });
    await controller.startNewLocalMatch(p1Id);
    const states: MatchClientSessionState[] = [];
    controller.connectLive({
      onState(state) {
        states.push(state);
      },
      onError(message) {
        throw new Error(message);
      },
    });
    const initialTimers = {
      players: {
        [p1Id]: { remainingMs: 1_000, isRunning: true },
      },
    };

    liveTransport.emitState({
      type: "stateSync",
      matchId: "match-1" as MatchId,
      serverSeq: 1,
      stateSeq: 1,
      snapshot: {
        matchId: "match-1" as MatchId,
        stateSeq: 1,
        players: {
          [p1Id]: {
            view: {
              timers: initialTimers,
            } as unknown as MatchStateSyncMessage["snapshot"]["players"][PlayerId]["view"],
            actions: [],
          },
        },
      },
      cards: { players: { [p1Id]: { cards: {} } } },
    });
    liveTransport.emitTimer({
      type: "timerSync",
      matchId: "match-1" as MatchId,
      serverSeq: 2,
      stateSeq: 1,
      timers: {
        players: {
          [p1Id]: { remainingMs: 900, isRunning: true },
        },
      },
    });

    const match = states.at(-1);
    assert.equal(match !== undefined && "snapshot" in match, true);
    if (match === undefined || !("snapshot" in match)) {
      throw new Error("Expected current match state.");
    }
    assert.equal(
      match.snapshot.players[p1Id]?.view.timers.players[p1Id]?.remainingMs,
      900,
    );
    assert.deepEqual(match.cards, { players: { [p1Id]: { cards: {} } } });
  });

  test("submitted live actions keep the fresh state sync card catalog", async () => {
    const transport = createFakeTransport();
    const liveTransport = createFakeLiveTransport();
    const p1Id = "p1" as PlayerId;
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });
    await controller.startNewLocalMatch(p1Id);
    controller.connectLive({
      onState() {},
      onError(message) {
        throw new Error(message);
      },
    });
    liveTransport.emitState({
      type: "stateSync",
      matchId: "match-1" as MatchId,
      serverSeq: 1,
      stateSeq: 1,
      snapshot: { matchId: "match-1" as MatchId, stateSeq: 1, players: {} },
      cards: { players: { ["stale" as PlayerId]: { cards: {} } } },
    });

    const result = await controller.submitVisibleAction({ actionIndex: 1 });

    assert.deepEqual(result.cards, {
      players: { [p1Id]: { cards: {} } },
    });
    assert.deepEqual(controller.currentState()?.cards, {
      players: { [p1Id]: { cards: {} } },
    });
  });

  test("submitted live actions forward selected DON ids", async () => {
    const transport = createFakeTransport();
    const liveTransport = createFakeLiveTransport();
    const p1Id = "p1" as PlayerId;
    const selectedDonInstanceIds = [
      "don-1" as InstanceId,
      "don-2" as InstanceId,
    ];
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });
    await controller.startNewLocalMatch(p1Id);
    controller.connectLive({
      onState() {},
      onError(message) {
        throw new Error(message);
      },
    });
    emitLoadedMatchState(liveTransport);

    await controller.submitVisibleAction({
      actionIndex: 4,
      selectedDonInstanceIds,
    });

    assert.deepEqual(liveTransport.submittedActionRequests, [
      {
        matchId: "match-1",
        playerId: p1Id,
        actionIndex: 4,
        expectedStateSeq: 1,
        selectedDonInstanceIds,
      },
    ]);
  });

  test("live state sync ignores older snapshots and catalogs", async () => {
    const transport = createFakeTransport();
    const liveTransport = createFakeLiveTransport();
    const p1Id = "p1" as PlayerId;
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });
    await controller.startNewLocalMatch(p1Id);
    const states: MatchClientSessionState[] = [];
    controller.connectLive({
      onState(state) {
        states.push(state);
      },
      onError(message) {
        throw new Error(message);
      },
    });
    liveTransport.emitState({
      type: "stateSync",
      matchId: "match-1" as MatchId,
      serverSeq: 2,
      stateSeq: 8,
      snapshot: { matchId: "match-1" as MatchId, stateSeq: 8, players: {} },
      cards: { players: { [p1Id]: { cards: {} } } },
    });
    liveTransport.emitState({
      type: "stateSync",
      matchId: "match-1" as MatchId,
      serverSeq: 3,
      stateSeq: 7,
      snapshot: { matchId: "match-1" as MatchId, stateSeq: 7, players: {} },
      cards: { players: { ["stale" as PlayerId]: { cards: {} } } },
    });

    assert.equal(states.length, 1);
    assert.deepEqual(controller.currentState()?.cards, {
      players: { [p1Id]: { cards: {} } },
    });
  });

  test("joins an existing local match by claiming only the requested seat", async () => {
    const transport = createFakeTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    const state = requireHydratingMatchClientState(
      await controller.joinLocalMatch({
        matchId: "match-2" as MatchId,
        playerId: "p2" as PlayerId,
      }),
    );

    assert.equal(state.matchId, "match-2");
    assert.deepEqual(controller.currentCredential(), {
      matchId: "match-2",
      playerId: "p2",
      sessionToken: accountSessionToken,
    });
  });

  test("claims and loads the match when a waiting lobby becomes ready", async () => {
    const transport = createFakeTransport();
    const lobbyLiveTransport = createFakeLobbyLiveTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      lobbyLiveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    const initial = await controller.startCustomLobby();
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
          p1: {
            playerId: "p1" as PlayerId,
            claimed: true,
            deck: { status: "ready" },
          },
          p2: {
            playerId: "p2" as PlayerId,
            claimed: true,
            deck: { status: "ready" },
          },
        },
      },
    });

    const readyState = await readyStatePromise;

    assert.equal("matchId" in readyState, true);
    assert.deepEqual(transport.claimedSeats, [
      {
        matchId: "match-1",
        playerId: "p1",
        sessionToken: transport.joinedLobbies[0]?.sessionToken,
      },
    ]);
    assert.deepEqual(controller.currentCredential(), {
      matchId: "match-1",
      playerId: "p1",
      sessionToken: transport.joinedLobbies[0]?.sessionToken,
    });
  });

  test("starts a custom lobby by joining with account session and assigned seat", async () => {
    const transport = createFakeTransport();
    const sessionStore = createClientSessionStore({
      storage: createMemoryClientStorage(),
    });
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      sessionStore,
    });

    await controller.startCustomLobby();

    const joinedLobby = transport.joinedLobbies[0];
    if (joinedLobby === undefined) {
      throw new Error("Expected lobby join request.");
    }
    assert.equal(joinedLobby.lobbyId, "lobby-1");
    assert.equal(joinedLobby.sessionToken, accountSessionToken);
  });

  test("joins a custom lobby without caller-selected player id", async () => {
    const transport = createFakeTransport();
    const sessionStore = createClientSessionStore({
      storage: createMemoryClientStorage(),
    });
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      sessionStore,
    });

    await controller.joinCustomLobby({ lobbyId: "lobby-1" });

    assert.deepEqual(Object.keys(transport.joinedLobbies[0] ?? {}), [
      "lobbyId",
      "sessionToken",
    ]);
  });

  test("submits a verified loadout handoff without using the deck hash route", async () => {
    const transport = createFakeTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.joinCustomLobby({ lobbyId: "lobby-1" });
    const next = await controller.submitLobbyLoadoutHandoff({
      handoffToken: "handoff-token",
    });

    assert.deepEqual(transport.submittedLobbyDecks, []);
    assert.deepEqual(transport.submittedLoadoutHandoffs, [
      {
        lobbyId: "lobby-1",
        handoffToken: "handoff-token",
      },
    ]);
    assert.equal("lobbyId" in next, true);
  });

  test("keeps lobby state when ready match claiming races with match creation", async () => {
    const transport = createFakeTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });
    transport.submitLobbyDeck = (input) => {
      transport.submittedLobbyDecks.push(input);
      return Promise.resolve({
        lobbyId: input.lobbyId,
        matchId: "match-1" as MatchId,
        seats: {
          p1: {
            playerId: "p1" as PlayerId,
            claimed: true,
            deck: { status: "ready" },
          },
          p2: {
            playerId: "p2" as PlayerId,
            claimed: true,
            deck: { status: "ready" },
          },
        },
      });
    };
    let claimAttempts = 0;
    transport.claimSeat = (input) => {
      transport.claimedSeats.push(input);
      claimAttempts += 1;
      if (claimAttempts === 1) {
        return Promise.reject(
          new Error(
            'Match transport request failed with HTTP 404: {"errors":["Match match-1 not found."]}',
          ),
        );
      }
      return Promise.resolve({
        matchId: input.matchId,
        seat: {
          playerId: input.playerId,
          sessionToken: input.sessionToken ?? `token-${String(input.playerId)}`,
        },
      });
    };
    await controller.joinCustomLobby({ lobbyId: "lobby-1" });

    const raced = await controller.submitLobbyDeck({
      deckHash: "deck-hash",
      donDeckCount: 10,
    });

    assert.equal("lobbyId" in raced, true);
    assert.equal(controller.currentCredential(), undefined);

    const retried = await controller.submitLobbyDeck({
      deckHash: "deck-hash",
      donDeckCount: 10,
    });

    assert.equal("matchId" in retried, true);
    assert.deepEqual(
      transport.claimedSeats.map((claim) => claim.matchId),
      ["match-1", "match-1"],
    );
  });

  test("refuses to submit actions before a seat is claimed", async () => {
    const controller = createMatchClientController({
      accountSessionToken,
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
      accountSessionToken,
      transport: createFakeTransport(),
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);
    controller.connectLive({ onState() {}, onError() {} });
    emitLoadedMatchState(liveTransport);
    await controller.submitVisibleAction({ actionIndex: 0 });

    assert.deepEqual(liveTransport.submittedActions, [0]);
  });

  test("does not fall back to HTTP gameplay when live transport is configured but disconnected", async () => {
    const transport = createFakeTransport();
    const liveTransport = createFakeLiveTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);
    controller.connectLive({ onState() {}, onError() {} });
    emitLoadedMatchState(liveTransport);
    controller.disconnectLive();

    await assert.rejects(
      () => controller.submitVisibleAction({ actionIndex: 0 }),
      /Live match connection is not active/u,
    );
  });

  test("does not fall back to HTTP decisions when live transport is configured but disconnected", async () => {
    const transport = createFakeTransport();
    const liveTransport = createFakeLiveTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);
    controller.connectLive({ onState() {}, onError() {} });
    emitLoadedMatchState(liveTransport);
    controller.disconnectLive();

    await assert.rejects(
      () =>
        controller.respondToDecision({
          decisionId: "decision-1" as DecisionId,
          response: { type: "mulligan", keep: true },
        }),
      /Live match connection is not active/u,
    );
  });

  test("revalidates an existing seat with the current account token when joining a match", async () => {
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
      accountSessionToken,
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
        sessionToken: accountSessionToken,
      },
    ]);
    assert.deepEqual(controller.currentCredential(), {
      matchId: "match-1",
      playerId: "p1",
      sessionToken: accountSessionToken,
    });
  });

  test("joins a direct match URL by resolving the current account seat", async () => {
    const transport = createFakeTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.joinLocalMatchByAccount({
      matchId: "match-1" as MatchId,
    });

    assert.deepEqual(transport.accountSeatClaims, [
      {
        matchId: "match-1",
        sessionToken: accountSessionToken,
      },
    ]);
    assert.deepEqual(controller.currentCredential(), {
      matchId: "match-1",
      playerId: "p1",
      sessionToken: accountSessionToken,
    });
  });

  test("rejects server-side decision errors instead of treating them as success", async () => {
    const liveTransport = createFakeLiveTransport({
      decisionErrors: ["Unsupported decision type."],
    });
    const controller = createMatchClientController({
      accountSessionToken,
      transport: createFakeTransport(),
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);
    controller.connectLive({ onState() {}, onError() {} });
    emitLoadedMatchState(liveTransport);

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
      accountSessionToken,
      transport: createFakeTransport(),
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);
    controller.connectLive({ onState() {}, onError() {} });
    emitLoadedMatchState(liveTransport);
    await controller.requestRollback({ rollbackPointId: "rollback:1" });

    assert.deepEqual(liveTransport.requestedRollbacks, ["rollback:1"]);
  });

  test("cancels rollback through the live connection", async () => {
    const liveTransport = createFakeLiveTransport();
    const controller = createMatchClientController({
      accountSessionToken,
      transport: createFakeTransport(),
      liveTransport,
      sessionStore: createClientSessionStore({
        storage: createMemoryClientStorage(),
      }),
    });

    await controller.startNewLocalMatch("p1" as PlayerId);
    controller.connectLive({ onState() {}, onError() {} });
    emitLoadedMatchState(liveTransport);
    await controller.cancelRollback();

    assert.equal(liveTransport.cancelledRollbacks, 1);
  });
});
