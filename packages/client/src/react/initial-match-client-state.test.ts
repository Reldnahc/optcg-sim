import { strict as assert } from "node:assert";
import { afterEach, beforeEach, test } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

import type { CreateCustomLobbyInput } from "../transport.js";
import type { MatchClientController } from "../controller.js";
import { loadInitialMatchClientState } from "./initial-match-client-state.js";

interface TestWindow {
  location: { href: string };
  history: {
    replaceState: (_state: unknown, _title: string, url: string) => void;
  };
}

const originalWindow = Reflect.get(globalThis, "window") as
  | TestWindow
  | undefined;
const testWindow: TestWindow = {
  location: { href: "http://localhost/" },
  history: {
    replaceState(_state, _title, url) {
      testWindow.location.href = new URL(url, testWindow.location.href).href;
    },
  },
};

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: testWindow,
  });
  testWindow.history.replaceState({}, "", "http://localhost/");
});

afterEach(() => {
  if (originalWindow !== undefined) {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

const fakeController = (): MatchClientController & {
  joinedByAccount: MatchId[];
  joinedByCode: string[];
  startedLobbies: CreateCustomLobbyInput[];
} => {
  const joinedByAccount: MatchId[] = [];
  const joinedByCode: string[] = [];
  const startedLobbies: CreateCustomLobbyInput[] = [];
  return {
    joinedByAccount,
    joinedByCode,
    startedLobbies,
    startCustomLobby(input = {}) {
      startedLobbies.push(input);
      return Promise.resolve({
        lobbyId: "lobby-1",
        seat: {
          lobbyId: "lobby-1",
          playerId: "p1" as PlayerId,
          sessionToken: "user:u:s",
        },
        lobby: {
          lobbyId: "lobby-1",
          settings: { formatId: input.settings?.formatId ?? "sandbox-open" },
          seats: {},
        },
      });
    },
    joinCustomLobby() {
      throw new Error("joinCustomLobby was not expected.");
    },
    joinCustomLobbyByCode(input) {
      joinedByCode.push(input.joinCode);
      return Promise.resolve({
        lobbyId: "lobby-1",
        joinCode: input.joinCode,
        seat: {
          lobbyId: "lobby-1",
          playerId: "p1" as PlayerId,
          sessionToken: "user:u:s",
        },
        lobby: {
          lobbyId: "lobby-1",
          joinCode: input.joinCode,
          settings: { formatId: "sandbox-open" },
          seats: {},
        },
      });
    },
    submitLobbyLoadoutHandoff() {
      throw new Error("submitLobbyLoadoutHandoff was not expected.");
    },
    submitLobbyDeck() {
      throw new Error("submitLobbyDeck was not expected.");
    },
    validateLobbyLoadouts() {
      throw new Error("validateLobbyLoadouts was not expected.");
    },
    validateLobbyDecks() {
      throw new Error("validateLobbyDecks was not expected.");
    },
    startNewLocalMatch() {
      throw new Error("startNewLocalMatch was not expected.");
    },
    joinLocalMatch() {
      throw new Error("joinLocalMatch was not expected.");
    },
    joinLocalMatchByAccount(input) {
      joinedByAccount.push(input.matchId);
      return Promise.resolve({
        matchId: input.matchId,
        seat: {
          matchId: input.matchId,
          playerId: "p1" as PlayerId,
        },
        snapshot: { matchId: input.matchId, stateSeq: 1, players: {} },
        cards: { players: {} },
      });
    },
    requestRematch() {
      throw new Error("requestRematch was not expected.");
    },
    chooseFirstPlayer() {
      throw new Error("chooseFirstPlayer was not expected.");
    },
    refresh() {
      throw new Error("refresh was not expected.");
    },
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
    connectLive() {},
    disconnectLive() {},
    connectLobbyLive() {},
    disconnectLobbyLive() {},
    currentCredential() {
      return undefined;
    },
    currentState() {
      return undefined;
    },
  };
};

test("initial direct match URL resolves the current account seat without local browser credentials", async () => {
  testWindow.history.replaceState({}, "", "/?matchId=match-1");
  const controller = fakeController();

  const state = await loadInitialMatchClientState(controller);

  assert.deepEqual(controller.joinedByAccount, ["match-1"]);
  assert.equal("matchId" in state, true);
  if (!("matchId" in state)) {
    throw new Error("Expected a match state.");
  }
  assert.equal(state.matchId, "match-1");
});

test("initial match route passes selected lobby format to lobby creation", async () => {
  testWindow.history.replaceState({}, "", "/match?lobbyFormat=Standard");
  const controller = fakeController();

  const state = await loadInitialMatchClientState(controller);

  assert.deepEqual(controller.startedLobbies, [
    { settings: { formatId: "Standard" } },
  ]);
  assert.equal("lobbyId" in state, true);
});

test("initial match route passes disabled timer setting to lobby creation", async () => {
  testWindow.history.replaceState(
    {},
    "",
    "/match?lobbyFormat=Standard&timerDisabled=1",
  );
  const controller = fakeController();

  const state = await loadInitialMatchClientState(controller);

  assert.deepEqual(controller.startedLobbies, [
    { settings: { formatId: "Standard", timerDisabled: true } },
  ]);
  assert.equal("lobbyId" in state, true);
});

test("initial match route passes bot opponent setting to lobby creation", async () => {
  testWindow.history.replaceState(
    {},
    "",
    "/match?lobbyFormat=Standard&botOpponent=1",
  );
  const controller = fakeController();

  const state = await loadInitialMatchClientState(controller);

  assert.deepEqual(controller.startedLobbies, [
    { settings: { formatId: "Standard", botOpponent: true } },
  ]);
  assert.equal("lobbyId" in state, true);
});

test("initial room alias route joins the lobby by short code", async () => {
  testWindow.history.replaceState({}, "", "/r/ab12");
  const controller = fakeController();

  const state = await loadInitialMatchClientState(controller);

  assert.deepEqual(controller.joinedByCode, ["ab12"]);
  assert.equal("lobbyId" in state, true);
  if (!("lobbyId" in state)) {
    throw new Error("Expected a lobby state.");
  }
  assert.equal(state.lobbyId, "lobby-1");
});
