import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";
import { createDevHttpServer } from "./dev-http-server.js";

interface CreatedDevMatchBody {
  matchId?: string;
  snapshot?: { stateSeq?: number };
  firstPlayerChoice?: {
    chooserPlayerId?: string;
  };
}

interface ClaimedDevSeatBody {
  matchId?: string;
  seat?: {
    playerId?: string;
    sessionToken?: string;
  };
}

interface StateSyncMessage {
  type?: string;
  snapshot?: {
    status?: string;
    playerLabels?: Record<string, { connectionStatus?: string }>;
    players?: Record<
      string,
      {
        view?: {
          timers?: {
            players?: Record<
              string,
              { remainingMs?: number; isRunning?: boolean }
            >;
            disconnects?: Record<
              string,
              { remainingMs?: number; isRunning?: boolean }
            >;
          };
        };
      }
    >;
  };
}

interface TestSocket {
  socket: WebSocket;
  next: () => Promise<unknown>;
}

const createFixtureDevHttpServer = async (
  options: {
    readonly socketIdleTimeoutMs?: number;
    readonly matchTimerPolicy?: {
      readonly gameTimeMs: number;
      readonly disconnectGraceMs: number;
    };
    readonly matchTimerTickMs?: number;
  } = {},
) =>
  createDevHttpServer({
    setup: await createFixtureDevMatchSetup(),
    fetchCard: createDefaultDevFixtureFetch(),
    ...options,
  });

const createDevMatch = async (
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
): Promise<CreatedDevMatchBody> => {
  const response = await fetch(`${server.url()}/api/matches`, {
    method: "POST",
  });
  assert.equal(response.status, 201);
  return (await response.json()) as CreatedDevMatchBody;
};

const chooseFirstPlayer = async (
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
  matchId: string,
  playerId: "p1" | "p2",
): Promise<CreatedDevMatchBody> => {
  const response = await fetch(
    `${server.url()}/api/matches/${matchId}/first-player-choice`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId, choice: "goFirst" }),
    },
  );
  assert.equal(response.status, 200);
  return (await response.json()) as CreatedDevMatchBody;
};

const createReadyDevMatch = async (
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
): Promise<{ matchId: string }> => {
  const created = await createDevMatch(server);
  const matchId = created.matchId;
  const chooser = created.firstPlayerChoice?.chooserPlayerId;
  if (matchId === undefined || (chooser !== "p1" && chooser !== "p2")) {
    throw new Error("Created dev match response was missing setup choice.");
  }
  const ready = await chooseFirstPlayer(server, matchId, chooser);
  if (ready.snapshot?.stateSeq === undefined) {
    throw new Error("Created dev match response was missing ready state.");
  }
  return { matchId };
};

const claimDevSeat = async (
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
  matchId: string,
  playerId: "p1" | "p2",
): Promise<string> => {
  const response = await fetch(
    `${server.url()}/api/matches/${matchId}/seats/${playerId}/claim`,
    {
      method: "POST",
      headers: { "x-optcg-session-token": `user:user-${playerId}:session-1` },
    },
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as ClaimedDevSeatBody;
  const token = body.seat?.sessionToken;
  if (body.matchId !== matchId || body.seat?.playerId !== playerId) {
    throw new Error("Claimed dev seat response had the wrong identity.");
  }
  if (token === undefined) {
    throw new Error("Claimed dev seat response did not include a token.");
  }
  return token;
};

const webSocketUrl = (
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
  matchId: string,
  playerId: string,
  token: string,
): string => {
  const url = new URL(
    `/api/matches/${encodeURIComponent(matchId)}/ws`,
    server.url().replace(/^http/u, "ws"),
  );
  url.searchParams.set("playerId", playerId);
  url.searchParams.set("sessionToken", token);
  return url.toString();
};

const openSocket = async (url: string): Promise<TestSocket> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const messages: unknown[] = [];
    const waiters: Array<(message: unknown) => void> = [];
    socket.addEventListener("message", (event) => {
      const parsed = JSON.parse(String(event.data)) as unknown;
      const waiter = waiters.shift();
      if (waiter === undefined) {
        messages.push(parsed);
        return;
      }
      waiter(parsed);
    });
    socket.addEventListener("open", () => {
      resolve({
        socket,
        next: () =>
          new Promise((messageResolve, messageReject) => {
            const queued = messages.shift();
            if (queued !== undefined) {
              messageResolve(queued);
              return;
            }
            const timeout = setTimeout(() => {
              messageReject(
                new Error("Timed out waiting for WebSocket message."),
              );
            }, 3000);
            waiters.push((message) => {
              clearTimeout(timeout);
              messageResolve(message);
            });
          }),
      });
    });
    socket.addEventListener("error", () => {
      reject(new Error("WebSocket failed to open."));
    });
  });

const waitForSocketClose = async (socket: WebSocket): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for WebSocket close."));
    }, 3000);
    socket.addEventListener(
      "close",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
};

const connectionStatus = (
  message: StateSyncMessage,
  playerId: "p1" | "p2",
): string | undefined =>
  message.snapshot?.playerLabels?.[playerId]?.connectionStatus;

const nextStateSync = async (socket: TestSocket): Promise<StateSyncMessage> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const message = (await socket.next()) as StateSyncMessage;
    if (message.type === "stateSync") {
      return message;
    }
  }
  throw new Error("Timed out waiting for state sync.");
};

const nextStateSyncWithStatus = async (
  socket: TestSocket,
  playerId: "p1" | "p2",
  status: "connected" | "disconnected",
): Promise<StateSyncMessage> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const message = await nextStateSync(socket);
    if (connectionStatus(message, playerId) === status) {
      return message;
    }
  }
  throw new Error(`Timed out waiting for ${playerId} to become ${status}.`);
};

describe("dev HTTP server websocket presence", () => {
  test("state sync reports player connection status beside public labels", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    const sockets: WebSocket[] = [];
    try {
      const match = await createReadyDevMatch(server);
      const p1Token = await claimDevSeat(server, match.matchId, "p1");
      const p2Token = await claimDevSeat(server, match.matchId, "p2");
      const p1Socket = await openSocket(
        webSocketUrl(server, match.matchId, "p1", p1Token),
      );
      const p2Socket = await openSocket(
        webSocketUrl(server, match.matchId, "p2", p2Token),
      );
      sockets.push(p1Socket.socket, p2Socket.socket);

      const p1Initial = (await p1Socket.next()) as StateSyncMessage;
      const p2Initial = (await p2Socket.next()) as StateSyncMessage;

      assert.equal(connectionStatus(p1Initial, "p1"), "connected");
      assert.equal(connectionStatus(p2Initial, "p1"), "connected");

      p1Socket.socket.close();

      const p2Update = await nextStateSyncWithStatus(
        p2Socket,
        "p1",
        "disconnected",
      );

      assert.equal(p2Update.type, "stateSync");
      assert.equal(connectionStatus(p2Update, "p1"), "disconnected");
      assert.equal(connectionStatus(p2Update, "p2"), "connected");
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await server.close();
    }
  });

  test("idle match sockets close and mark that player disconnected without ending the match", async () => {
    const server = await createFixtureDevHttpServer({
      socketIdleTimeoutMs: 500,
    });
    await server.listen(0, "127.0.0.1");
    const sockets: WebSocket[] = [];
    try {
      const match = await createReadyDevMatch(server);
      const p1Token = await claimDevSeat(server, match.matchId, "p1");
      const p2Token = await claimDevSeat(server, match.matchId, "p2");
      const p1Socket = await openSocket(
        webSocketUrl(server, match.matchId, "p1", p1Token),
      );
      const p2Socket = await openSocket(
        webSocketUrl(server, match.matchId, "p2", p2Token),
      );
      sockets.push(p1Socket.socket, p2Socket.socket);
      await p1Socket.next();
      await p2Socket.next();

      await new Promise((resolve) => setTimeout(resolve, 250));
      p2Socket.socket.send("{}");
      await waitForSocketClose(p1Socket.socket);
      const p2Update = await nextStateSyncWithStatus(
        p2Socket,
        "p1",
        "disconnected",
      );

      assert.equal(p2Update.type, "stateSync");
      assert.equal(connectionStatus(p2Update, "p1"), "disconnected");
      assert.equal(connectionStatus(p2Update, "p2"), "connected");
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await server.close();
    }
  });

  test("reconnected match sockets immediately update opponent presence", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    const sockets: WebSocket[] = [];
    try {
      const match = await createReadyDevMatch(server);
      const p1Token = await claimDevSeat(server, match.matchId, "p1");
      const p2Token = await claimDevSeat(server, match.matchId, "p2");
      const p1Socket = await openSocket(
        webSocketUrl(server, match.matchId, "p1", p1Token),
      );
      const p2Socket = await openSocket(
        webSocketUrl(server, match.matchId, "p2", p2Token),
      );
      sockets.push(p1Socket.socket, p2Socket.socket);
      await p1Socket.next();
      await p2Socket.next();

      p1Socket.socket.close();
      const disconnectedUpdate = await nextStateSyncWithStatus(
        p2Socket,
        "p1",
        "disconnected",
      );
      assert.equal(connectionStatus(disconnectedUpdate, "p1"), "disconnected");

      const reconnectedP1Socket = await openSocket(
        webSocketUrl(server, match.matchId, "p1", p1Token),
      );
      sockets.push(reconnectedP1Socket.socket);
      await reconnectedP1Socket.next();

      const reconnectedUpdate = await nextStateSyncWithStatus(
        p2Socket,
        "p1",
        "connected",
      );

      assert.equal(connectionStatus(reconnectedUpdate, "p1"), "connected");
      assert.equal(connectionStatus(reconnectedUpdate, "p2"), "connected");
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await server.close();
    }
  });

  test("disconnect grace timer is visible and auto-concedes after expiry", async () => {
    const server = await createFixtureDevHttpServer({
      matchTimerPolicy: { gameTimeMs: 1_000, disconnectGraceMs: 250 },
      matchTimerTickMs: 10,
    });
    await server.listen(0, "127.0.0.1");
    const sockets: WebSocket[] = [];
    try {
      const match = await createReadyDevMatch(server);
      const p1Token = await claimDevSeat(server, match.matchId, "p1");
      const p2Token = await claimDevSeat(server, match.matchId, "p2");
      const p1Socket = await openSocket(
        webSocketUrl(server, match.matchId, "p1", p1Token),
      );
      const p2Socket = await openSocket(
        webSocketUrl(server, match.matchId, "p2", p2Token),
      );
      sockets.push(p1Socket.socket, p2Socket.socket);
      await p1Socket.next();
      await p2Socket.next();

      p1Socket.socket.close();

      const disconnectedUpdate = await nextStateSyncWithStatus(
        p2Socket,
        "p1",
        "disconnected",
      );
      const visibleDisconnectTimer =
        disconnectedUpdate.snapshot?.players?.["p2"]?.view?.timers
          ?.disconnects?.["p1"];
      assert.ok(visibleDisconnectTimer !== undefined);
      assert.equal(visibleDisconnectTimer.isRunning, true);
      const remainingDisconnectMs = visibleDisconnectTimer.remainingMs;
      assert.ok(remainingDisconnectMs !== undefined);
      assert.ok(remainingDisconnectMs <= 250);

      for (let attempt = 0; attempt < 30; attempt += 1) {
        const update = await nextStateSync(p2Socket);
        if (update.snapshot?.status === "completed") {
          const completedP1Timer =
            update.snapshot.players?.["p2"]?.view?.timers?.players?.["p1"];
          assert.equal(completedP1Timer?.isRunning, false);
          return;
        }
      }
      throw new Error("Timed out waiting for disconnect auto-concede.");
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await server.close();
    }
  });
});
