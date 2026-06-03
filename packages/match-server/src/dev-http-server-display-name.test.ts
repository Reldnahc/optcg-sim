import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createDevHttpServer } from "./dev-http-server.js";
import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";

const createFixtureDevHttpServer = async () =>
  createDevHttpServer({
    setup: await createFixtureDevMatchSetup(),
    fetchCard: createDefaultDevFixtureFetch(),
  });

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

interface TestSocket {
  socket: WebSocket;
  next: () => Promise<unknown>;
}

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
            }, 1000);
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

const createDevMatch = async (
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
): Promise<CreatedDevMatchBody> => {
  const response = await fetch(`${server.url()}/api/matches`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
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
    throw new Error("First-player choice did not start the match.");
  }
  return { matchId };
};

const claimDevSeatWithToken = async (
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
  matchId: string,
  playerId: "p1" | "p2",
  sessionToken: string,
): Promise<string> => {
  const response = await fetch(
    `${server.url()}/api/matches/${matchId}/seats/${playerId}/claim`,
    {
      method: "POST",
      headers: { "x-optcg-session-token": sessionToken },
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

const initialPlayerLabels = async (
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
  matchId: string,
  playerId: "p1" | "p2",
  token: string,
): Promise<Record<string, { displayName?: string }> | undefined> => {
  const socket = await openSocket(
    webSocketUrl(server, matchId, playerId, token),
  );
  try {
    const initial = (await socket.next()) as {
      snapshot?: {
        playerLabels?: Record<string, { displayName?: string }>;
      };
    };
    return initial.snapshot?.playerLabels;
  } finally {
    socket.socket.close();
  }
};

describe("dev HTTP server display names", () => {
  test("websocket state sync includes public account display names", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const match = await createReadyDevMatch(server);
      const p1Token = await claimDevSeatWithToken(
        server,
        match.matchId,
        "p1",
        "user:user-a:session-1:Alice",
      );
      await claimDevSeatWithToken(
        server,
        match.matchId,
        "p2",
        "user:user-b:session-1:Bob",
      );

      assert.deepEqual(
        await initialPlayerLabels(server, match.matchId, "p1", p1Token),
        {
          p1: { displayName: "Alice" },
          p2: { displayName: "Bob" },
        },
      );
    } finally {
      await server.close();
    }
  });

  test("matching account claims refresh stale seat display names", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const match = await createReadyDevMatch(server);
      await claimDevSeatWithToken(
        server,
        match.matchId,
        "p1",
        "user:user-a:session-1",
      );
      const refreshedToken = await claimDevSeatWithToken(
        server,
        match.matchId,
        "p1",
        "user:user-a:session-1:Alice",
      );

      assert.equal(
        (
          await initialPlayerLabels(server, match.matchId, "p1", refreshedToken)
        )?.["p1"]?.displayName,
        "Alice",
      );
    } finally {
      await server.close();
    }
  });
});
