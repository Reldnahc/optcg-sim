import { strict as assert } from "node:assert";
import { afterEach, test } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

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

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: testWindow,
});

afterEach(() => {
  testWindow.history.replaceState({}, "", "http://localhost/");
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
} => {
  const joinedByAccount: MatchId[] = [];
  return {
    joinedByAccount,
    startCustomLobby() {
      throw new Error("startCustomLobby was not expected.");
    },
    joinCustomLobby() {
      throw new Error("joinCustomLobby was not expected.");
    },
    submitLobbyLoadoutHandoff() {
      throw new Error("submitLobbyLoadoutHandoff was not expected.");
    },
    validateLobbyLoadouts() {
      throw new Error("validateLobbyLoadouts was not expected.");
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
