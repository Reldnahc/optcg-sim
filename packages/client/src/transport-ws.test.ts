import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { describe, test } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

import {
  createDevWebSocketLobbyTransport,
  createDevWebSocketMatchTransport,
} from "./transport-ws.js";
import type { MatchStateSyncMessage } from "./transport.js";

const expectedCanonicalJson = (value: unknown): string => {
  if (value === undefined) {
    throw new TypeError("unsupported");
  }
  if (Array.isArray(value)) {
    return `[${value.map(expectedCanonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${expectedCanonicalJson(record[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const expectedRequestHash = (value: unknown): string =>
  createHash("sha256").update(expectedCanonicalJson(value)).digest("hex");

const waitForSentPayload = async (socket: FakeWebSocket): Promise<string> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const payload = socket.sent[0];
    if (payload !== undefined) {
      return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Expected a sent WebSocket payload.");
};

class FakeWebSocket extends EventTarget {
  public readonly sent: string[] = [];
  public readyState: number = WebSocket.CONNECTING;

  public constructor(public readonly url: string | URL) {
    super();
  }

  public open(): void {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  public receive(payload: unknown): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(payload) }),
    );
  }

  public send(payload: string): void {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error("Cannot send before WebSocket is open.");
    }
    this.sent.push(payload);
  }

  public close(): void {
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
}

const createRecordingWebSocket = (): {
  WebSocket: typeof WebSocket;
  sockets: FakeWebSocket[];
} => {
  const sockets: FakeWebSocket[] = [];
  const RecordingWebSocket = class extends FakeWebSocket {
    public constructor(url: string | URL) {
      super(url);
      sockets.push(this);
    }
  };
  return {
    WebSocket: RecordingWebSocket as unknown as typeof WebSocket,
    sockets,
  };
};

describe("dev WebSocket match transport", () => {
  test("connects lobby websocket with player id and session token", () => {
    const recording = createRecordingWebSocket();
    const transport = createDevWebSocketLobbyTransport({
      baseUrl: "http://localhost:3000",
      WebSocket: recording.WebSocket,
    });

    transport.connect({
      lobbyId: "lobby-1",
      playerId: "p1" as PlayerId,
      sessionToken: "user:user-1:session-1",
      onLobbySync() {},
      onError(message) {
        throw new Error(message);
      },
    });

    const socket = recording.sockets[0];
    if (socket === undefined) {
      throw new Error("Expected a WebSocket to be created.");
    }
    const url = new URL(String(socket.url));
    assert.equal(url.pathname, "/api/lobbies/lobby-1/ws");
    assert.equal(url.searchParams.get("playerId"), "p1");
    assert.equal(url.searchParams.get("sessionToken"), "user:user-1:session-1");
  });

  test("queues action requests until the socket opens and resolves them from state sync", async () => {
    const recording = createRecordingWebSocket();
    const receivedStates: MatchStateSyncMessage[] = [];
    const transport = createDevWebSocketMatchTransport({
      baseUrl: "http://localhost:3000",
      WebSocket: recording.WebSocket,
      randomUUID: () => "client-action-1",
    });
    const connection = transport.connect({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      sessionToken: "token-p1",
      onStateSync(message) {
        receivedStates.push(message);
      },
      onSetupSync() {},
      onSessionTransition() {},
      onError(message) {
        throw new Error(message);
      },
    });
    const socket = recording.sockets[0];
    if (socket === undefined) {
      throw new Error("Expected a WebSocket to be created.");
    }

    const resultPromise = connection.submitVisibleAction({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      actionIndex: 2,
      expectedStateSeq: 7,
    });

    assert.equal(socket.sent.length, 0);
    socket.open();
    const sentPayload = await waitForSentPayload(socket);
    assert.equal(socket.sent.length, 1);
    assert.deepEqual(JSON.parse(sentPayload) as unknown, {
      type: "submitAction",
      clientActionId: "client-action-1",
      matchId: "match-1",
      playerId: "p1",
      actionIndex: 2,
      expectedStateSeq: 7,
      requestHash: expectedRequestHash({
        actionIndex: 2,
        expectedStateSeq: 7,
        playerId: "p1",
        type: "submitAction",
      }),
    });

    socket.receive({
      type: "actionResult",
      clientActionId: "client-action-1",
      matchId: "match-1",
      accepted: true,
      stateSeq: 8,
      actionSeq: 1,
      errors: [],
    });
    socket.receive({
      type: "stateSync",
      matchId: "match-1",
      serverSeq: 3,
      stateSeq: 8,
      snapshot: { stateSeq: 8, players: {} },
    });

    const result = await resultPromise;

    assert.equal(result.snapshot.stateSeq, 8);
    assert.equal(receivedStates.length, 1);
  });

  test("routes setup and session transition sync messages", () => {
    const recording = createRecordingWebSocket();
    const setupMessages: unknown[] = [];
    const transitionMessages: unknown[] = [];
    const transport = createDevWebSocketMatchTransport({
      baseUrl: "http://localhost:3000",
      WebSocket: recording.WebSocket,
    });
    transport.connect({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      sessionToken: "token-p1",
      onStateSync() {},
      onSetupSync(message) {
        setupMessages.push(message);
      },
      onSessionTransition(message) {
        transitionMessages.push(message);
      },
      onError(message) {
        throw new Error(message);
      },
    });
    const socket = recording.sockets[0];
    if (socket === undefined) {
      throw new Error("Expected a WebSocket to be created.");
    }

    socket.receive({
      type: "setupSync",
      matchId: "match-1",
      serverSeq: 1,
      firstPlayerChoice: {
        chooserPlayerId: "p1",
        choices: ["goFirst", "goSecond"],
      },
    });
    socket.receive({
      type: "sessionTransition",
      matchId: "match-1",
      serverSeq: 2,
      nextMatchId: "match-2",
      firstPlayerChoice: {
        chooserPlayerId: "p2",
        choices: ["goFirst", "goSecond"],
      },
    });

    assert.equal(setupMessages.length, 1);
    assert.equal(transitionMessages.length, 1);
  });

  test("falls back to getRandomValues for client action ids when randomUUID is unavailable", async () => {
    const recording = createRecordingWebSocket();
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: originalCrypto.subtle,
        getRandomValues: (array: Uint8Array) => {
          array.fill(0x11);
          return array;
        },
      },
    });
    try {
      const transport = createDevWebSocketMatchTransport({
        baseUrl: "http://localhost:3000",
        WebSocket: recording.WebSocket,
      });
      const connection = transport.connect({
        matchId: "match-1" as MatchId,
        playerId: "p1" as PlayerId,
        sessionToken: "token-p1",
        onStateSync() {},
        onSetupSync() {},
        onSessionTransition() {},
        onError(message) {
          throw new Error(message);
        },
      });
      const socket = recording.sockets[0];
      if (socket === undefined) {
        throw new Error("Expected a WebSocket to be created.");
      }

      void connection.submitVisibleAction({
        matchId: "match-1" as MatchId,
        playerId: "p1" as PlayerId,
        actionIndex: 2,
        expectedStateSeq: 7,
      });

      socket.open();
      const sentPayload = await waitForSentPayload(socket);
      assert.equal(
        (JSON.parse(sentPayload) as { clientActionId: string }).clientActionId,
        "11111111-1111-4111-9111-111111111111",
      );
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  test("sends rollback requests through the live match socket", async () => {
    const recording = createRecordingWebSocket();
    const transport = createDevWebSocketMatchTransport({
      baseUrl: "http://localhost:3000",
      WebSocket: recording.WebSocket,
      randomUUID: () => "client-action-rollback",
    });
    const connection = transport.connect({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      sessionToken: "token-p1",
      onStateSync() {},
      onSetupSync() {},
      onSessionTransition() {},
      onError(message) {
        throw new Error(message);
      },
    });
    const socket = recording.sockets[0];
    if (socket === undefined) {
      throw new Error("Expected a WebSocket to be created.");
    }

    const resultPromise = connection.requestRollback({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      rollbackPointId: "rollback:1",
      expectedStateSeq: 7,
    });

    socket.open();
    const sentPayload = await waitForSentPayload(socket);
    assert.deepEqual(JSON.parse(sentPayload) as unknown, {
      type: "requestRollback",
      clientActionId: "client-action-rollback",
      matchId: "match-1",
      playerId: "p1",
      rollbackPointId: "rollback:1",
      expectedStateSeq: 7,
      requestHash: expectedRequestHash({
        expectedStateSeq: 7,
        playerId: "p1",
        rollbackPointId: "rollback:1",
        type: "requestRollback",
      }),
    });

    socket.receive({
      type: "actionResult",
      clientActionId: "client-action-rollback",
      matchId: "match-1",
      accepted: true,
      stateSeq: 8,
      actionSeq: 1,
      errors: [],
    });
    socket.receive({
      type: "stateSync",
      matchId: "match-1",
      serverSeq: 3,
      stateSeq: 8,
      snapshot: { stateSeq: 8, players: {} },
    });

    const result = await resultPromise;

    assert.equal(result.snapshot.stateSeq, 8);
  });

  test("sends rollback cancellation through the live match socket", async () => {
    const recording = createRecordingWebSocket();
    const transport = createDevWebSocketMatchTransport({
      baseUrl: "http://localhost:3000",
      WebSocket: recording.WebSocket,
      randomUUID: () => "client-action-cancel-rollback",
    });
    const connection = transport.connect({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      sessionToken: "token-p1",
      onStateSync() {},
      onSetupSync() {},
      onSessionTransition() {},
      onError(message) {
        throw new Error(message);
      },
    });
    const socket = recording.sockets[0];
    if (socket === undefined) {
      throw new Error("Expected a WebSocket to be created.");
    }

    const resultPromise = connection.cancelRollback({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      expectedStateSeq: 7,
    });

    socket.open();
    const sentPayload = await waitForSentPayload(socket);
    assert.deepEqual(JSON.parse(sentPayload) as unknown, {
      type: "cancelRollback",
      clientActionId: "client-action-cancel-rollback",
      matchId: "match-1",
      playerId: "p1",
      expectedStateSeq: 7,
      requestHash: expectedRequestHash({
        expectedStateSeq: 7,
        playerId: "p1",
        type: "cancelRollback",
      }),
    });

    socket.receive({
      type: "actionResult",
      clientActionId: "client-action-cancel-rollback",
      matchId: "match-1",
      accepted: true,
      stateSeq: 8,
      actionSeq: 1,
      errors: [],
    });
    socket.receive({
      type: "stateSync",
      matchId: "match-1",
      serverSeq: 3,
      stateSeq: 8,
      snapshot: { stateSeq: 8, players: {} },
    });

    const result = await resultPromise;

    assert.equal(result.snapshot.stateSeq, 8);
  });

  test("sends decision responses with expected decision and request hash", async () => {
    const recording = createRecordingWebSocket();
    const transport = createDevWebSocketMatchTransport({
      baseUrl: "http://localhost:3000",
      WebSocket: recording.WebSocket,
      randomUUID: () => "client-action-decision",
    });
    const connection = transport.connect({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      sessionToken: "token-p1",
      onStateSync() {},
      onSetupSync() {},
      onSessionTransition() {},
      onError(message) {
        throw new Error(message);
      },
    });
    const socket = recording.sockets[0];
    if (socket === undefined) {
      throw new Error("Expected a WebSocket to be created.");
    }

    void connection.respondToDecision({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      decisionId: "decision-1" as never,
      expectedDecisionId: "decision-1" as never,
      expectedStateSeq: 7,
      response: { type: "cards", cards: [] },
    });

    socket.open();
    const sentPayload = await waitForSentPayload(socket);
    assert.deepEqual(JSON.parse(sentPayload) as unknown, {
      type: "respondToDecision",
      clientActionId: "client-action-decision",
      matchId: "match-1",
      playerId: "p1",
      decisionId: "decision-1",
      expectedDecisionId: "decision-1",
      expectedStateSeq: 7,
      response: { type: "cards", cards: [] },
      requestHash: expectedRequestHash({
        decisionId: "decision-1",
        playerId: "p1",
        response: { type: "cards", cards: [] },
        type: "respondToDecision",
      }),
    });
  });
});
