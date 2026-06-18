import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { MatchId, PlayerId } from "@optcg/types";

import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";
import { createMatchHttpServer } from "./match-http-server.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import { requestHash } from "./action-envelope.js";
import type { MatchHttpServer } from "./match-http-server.js";
import type { MatchPersistence } from "./session-types.js";

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
    stateSeq?: number;
    players?: Record<string, unknown>;
  };
  cards?: {
    players?: Record<string, unknown>;
  };
}

interface ServerShutdownMessage {
  type?: string;
  matchId?: string;
  message?: string;
}

interface ControlledPersistence extends MatchPersistence {
  readonly base: MatchPersistence;
  readonly appendStarted: Promise<void>;
  readonly releaseAppend: () => void;
}

interface TestSocket {
  readonly socket: WebSocket;
  readonly next: () => Promise<unknown>;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const createAppendBlockedPersistence = (): ControlledPersistence => {
  const base = createInMemoryMatchPersistence();
  let appendStartedResolve: () => void = () => undefined;
  let releaseAppendResolve: () => void = () => undefined;
  let blocked = false;
  const appendStarted = new Promise<void>((resolve) => {
    appendStartedResolve = resolve;
  });
  const releaseAppendPromise = new Promise<void>((resolve) => {
    releaseAppendResolve = resolve;
  });
  return {
    ...base,
    base,
    appendStarted,
    releaseAppend: releaseAppendResolve,
    async appendAction(input) {
      if (!blocked) {
        blocked = true;
        appendStartedResolve();
        await releaseAppendPromise;
      }
      await base.appendAction(input);
    },
  };
};

const createFixtureMatchHttpServer = async (
  matchPersistence: MatchPersistence,
): Promise<MatchHttpServer> =>
  createMatchHttpServer({
    setup: await createFixtureDevMatchSetup(),
    fetchCard: createDefaultDevFixtureFetch(),
    createDefaultMatch: false,
    matchPersistence,
  });

const createDevMatch = async (
  server: MatchHttpServer,
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
  server: MatchHttpServer,
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
  server: MatchHttpServer,
): Promise<{ readonly matchId: string; readonly stateSeq: number }> => {
  const created = await createDevMatch(server);
  const matchId = created.matchId;
  const chooser = created.firstPlayerChoice?.chooserPlayerId;
  if (matchId === undefined || (chooser !== "p1" && chooser !== "p2")) {
    throw new Error("Created dev match response was missing setup choice.");
  }
  const ready = await chooseFirstPlayer(server, matchId, chooser);
  const stateSeq = ready.snapshot?.stateSeq;
  if (stateSeq === undefined) {
    throw new Error("Ready dev match response was missing state.");
  }
  return { matchId, stateSeq };
};

const claimDevSeat = async (
  server: MatchHttpServer,
  matchId: string,
  playerId: "p1" | "p2",
): Promise<string> => {
  const sessionToken = `user:restart-${playerId}:session-1`;
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

const webSocketUrl = (
  server: MatchHttpServer,
  matchId: string,
  playerId: "p1" | "p2",
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
            }, 1_000);
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

describe("match HTTP server active recovery", () => {
  test("recovers an active match after server restart and accepts existing seat tokens", async () => {
    const persistence = createInMemoryMatchPersistence();
    const firstServer = await createFixtureMatchHttpServer(persistence);
    await firstServer.listen(0, "127.0.0.1");
    const created = await createReadyDevMatch(firstServer);
    const p1Token = await claimDevSeat(firstServer, created.matchId, "p1");
    const p2Token = await claimDevSeat(firstServer, created.matchId, "p2");
    await firstServer.close();

    const secondServer = await createFixtureMatchHttpServer(persistence);
    await secondServer.listen(0, "127.0.0.1");
    const sockets: WebSocket[] = [];
    try {
      const p1Socket = await openSocket(
        webSocketUrl(secondServer, created.matchId, "p1", p1Token),
      );
      const p2Socket = await openSocket(
        webSocketUrl(secondServer, created.matchId, "p2", p2Token),
      );
      sockets.push(p1Socket.socket, p2Socket.socket);

      const p1Initial = (await p1Socket.next()) as StateSyncMessage;
      const p2Initial = (await p2Socket.next()) as StateSyncMessage;

      assert.equal(p1Initial.type, "stateSync");
      assert.equal(p2Initial.type, "stateSync");
      assert.equal(p1Initial.snapshot?.stateSeq, created.stateSeq);
      assert.equal(p2Initial.snapshot?.stateSeq, created.stateSeq);
      assert.ok(p1Initial.snapshot.players?.["p1"] !== undefined);
      assert.ok(p2Initial.snapshot.players?.["p2"] !== undefined);
      assert.ok(p1Initial.cards?.players?.["p1"] !== undefined);
      assert.ok(p2Initial.cards?.players?.["p2"] !== undefined);
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await secondServer.close();
    }
  });

  test("waits for in-flight action persistence before closing", async () => {
    const persistence = createAppendBlockedPersistence();
    const server = await createFixtureMatchHttpServer(persistence);
    await server.listen(0, "127.0.0.1");
    let closePromise: Promise<"closed"> | undefined;
    const sockets: WebSocket[] = [];
    try {
      const created = await createReadyDevMatch(server);
      const p1Token = await claimDevSeat(server, created.matchId, "p1");
      const p1Socket = await openSocket(
        webSocketUrl(server, created.matchId, "p1", p1Token),
      );
      sockets.push(p1Socket.socket);
      const p1Initial = (await p1Socket.next()) as StateSyncMessage;
      const expectedStateSeq = p1Initial.snapshot?.stateSeq;
      if (expectedStateSeq === undefined) {
        throw new Error("Initial state sync was missing stateSeq.");
      }

      p1Socket.socket.send(
        JSON.stringify({
          type: "submitAction",
          matchId: created.matchId,
          playerId: "p1",
          clientActionId: "close-drain-action",
          actionIndex: 0,
          expectedStateSeq,
          requestHash: requestHash({
            type: "submitAction",
            playerId: "p1" as PlayerId,
            actionIndex: 0,
            expectedStateSeq,
          }),
        }),
      );
      await persistence.appendStarted;

      closePromise = server.close().then(() => "closed" as const);
      const shutdownMessage = (await p1Socket.next()) as ServerShutdownMessage;
      assert.equal(shutdownMessage.type, "serverShutdown");
      assert.equal(shutdownMessage.matchId, created.matchId);
      assert.match(
        shutdownMessage.message ?? "",
        /server is shutting down.*game will resume/iu,
      );
      const earlyClose = await Promise.race([
        closePromise,
        delay(25).then(() => "pending" as const),
      ]);

      assert.equal(earlyClose, "pending");

      persistence.releaseAppend();
      await closePromise;
      const recovered = await persistence.base.loadSnapshot(
        created.matchId as MatchId,
      );

      assert.equal(recovered?.actions.length, 1);
    } finally {
      persistence.releaseAppend();
      for (const socket of sockets) {
        socket.close();
      }
      if (closePromise === undefined) {
        await server.close();
      } else {
        await closePromise;
      }
    }
  });
});
