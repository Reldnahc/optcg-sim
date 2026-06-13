import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import type { CardRef, DecisionId, PlayerId } from "@optcg/types";

import { createMatchHttpServer } from "./match-http-server.js";
import { websocketTextFrame } from "./match-http-server.js";
import { requestHash } from "./action-envelope.js";
import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";

const createFixtureMatchHttpServer = async () =>
  createMatchHttpServer({
    setup: await createFixtureDevMatchSetup(),
    fetchCard: createDefaultDevFixtureFetch(),
  });

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

interface CreatedDevMatchBody {
  matchId?: string;
  seats?: Record<string, { playerId?: string; claimed?: boolean }>;
  snapshot?: { stateSeq?: number };
  firstPlayerChoice?: {
    chooserPlayerId?: string;
    choices?: string[];
    resolvedFirstPlayerId?: string;
  };
}

interface ClaimedDevSeatBody {
  matchId?: string;
  seat?: {
    playerId?: string;
    sessionToken?: string;
  };
}

const requireStateSeq = (
  snapshot: { stateSeq?: number } | undefined,
): number => {
  const stateSeq = snapshot?.stateSeq;
  if (stateSeq === undefined) {
    throw new Error("Expected snapshot stateSeq.");
  }
  return stateSeq;
};

const webSocketUrl = (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
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

interface TestSocket {
  socket: WebSocket;
  next: () => Promise<unknown>;
}

interface TestActionResultBody {
  type?: string;
  accepted?: boolean;
  clientActionId?: string;
}

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

const nextActionResult = async (
  socket: TestSocket,
): Promise<TestActionResultBody> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const message = (await socket.next()) as TestActionResultBody;
    if (message.type === "actionResult") {
      return message;
    }
    if (message.type === "stateSync" || message.type === "heartbeat") {
      continue;
    }
    throw new Error(`Unexpected WebSocket message ${String(message.type)}.`);
  }
  throw new Error("Timed out waiting for action result.");
};

const createDevMatch = async (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
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
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
  matchId: string,
  playerId: "p1" | "p2",
  choice: "goFirst" | "goSecond",
): Promise<CreatedDevMatchBody> => {
  const response = await fetch(
    `${server.url()}/api/matches/${matchId}/first-player-choice`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId, choice }),
    },
  );
  assert.equal(response.status, 200);
  return (await response.json()) as CreatedDevMatchBody;
};

const requireCreatedMatch = (
  body: CreatedDevMatchBody,
): {
  matchId: string;
  stateSeq: number;
} => {
  const matchId = body.matchId;
  const stateSeq = body.snapshot?.stateSeq;
  if (matchId === undefined || stateSeq === undefined) {
    throw new Error("Created dev match response was missing match data.");
  }
  const seats = body.seats;
  const p1Seat = seats?.["p1"];
  const p2Seat = seats?.["p2"];
  if (p1Seat === undefined || p2Seat === undefined) {
    throw new Error("Created dev match response was missing seat summaries.");
  }
  assert.equal(p1Seat.playerId, "p1");
  assert.equal(p2Seat.playerId, "p2");
  assert.equal(JSON.stringify(body).includes("sessionToken"), false);
  return { matchId, stateSeq };
};

const createReadyDevMatch = async (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
): Promise<{ matchId: string; stateSeq: number }> => {
  const created = await createDevMatch(server);
  const matchId = created.matchId;
  const chooser = created.firstPlayerChoice?.chooserPlayerId;
  if (matchId === undefined || (chooser !== "p1" && chooser !== "p2")) {
    throw new Error("Created dev match response was missing setup choice.");
  }
  return requireCreatedMatch(
    await chooseFirstPlayer(server, matchId, chooser, "goFirst"),
  );
};

const claimDevSeat = async (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
  matchId: string,
  playerId: "p1" | "p2",
): Promise<string> => {
  const sessionToken = `user:user-${playerId}:session-1`;
  return claimDevSeatWithToken(server, matchId, playerId, sessionToken);
};

const claimDevSeatWithToken = async (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
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

describe("match HTTP server", () => {
  test("does not serve the legacy static match UI", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/`);

      assert.equal(response.status, 404);
      assert.equal(await response.text(), "Not found");
    } finally {
      await server.close();
    }
  });

  test("websocket text frames support state sync payloads larger than 16-bit lengths", () => {
    const payload = "x".repeat(81911);

    const frame = websocketTextFrame(payload);

    assert.equal(frame[0], 0x81);
    assert.equal(frame[1], 127);
    assert.equal(frame.readUInt32BE(2), 0);
    assert.equal(frame.readUInt32BE(6), Buffer.byteLength(payload, "utf8"));
    assert.equal(frame.subarray(10).toString("utf8"), payload);
  });

  test("creates independent local authenticated dev matches keyed by matchId", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    const sockets: WebSocket[] = [];
    try {
      const first = await createReadyDevMatch(server);
      const second = await createReadyDevMatch(server);
      assert.notEqual(first.matchId, second.matchId);
      const firstP1Token = await claimDevSeat(server, first.matchId, "p1");
      const firstP1Socket = await openSocket(
        webSocketUrl(server, first.matchId, "p1", firstP1Token),
      );
      sockets.push(firstP1Socket.socket);
      const firstInitial = (await firstP1Socket.next()) as {
        snapshot?: { stateSeq?: number };
      };
      const expectedStateSeq = requireStateSeq(firstInitial.snapshot);

      firstP1Socket.socket.send(
        JSON.stringify({
          type: "submitAction",
          matchId: first.matchId,
          playerId: "p1",
          clientActionId: "first-action",
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
      const actionResult = (await firstP1Socket.next()) as {
        type?: string;
        accepted?: boolean;
      };
      assert.equal(actionResult.type, "actionResult");
      assert.equal(actionResult.accepted, true);
      const firstUpdate = (await firstP1Socket.next()) as {
        type?: string;
        snapshot?: { stateSeq?: number };
      };
      assert.equal(firstUpdate.type, "stateSync");
      assert.notEqual(firstUpdate.snapshot?.stateSeq, second.stateSeq);
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await server.close();
    }
  });

  test("does not expose HTTP gameplay action or decision routes", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const match = await createReadyDevMatch(server);
      const urls = [
        `${server.url()}/api/matches/${match.matchId}/action`,
        `${server.url()}/api/matches/${match.matchId}/decision`,
        `${server.url()}/api/action`,
        `${server.url()}/api/decision`,
      ];

      for (const url of urls) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        assert.equal(response.status, 404);
      }
    } finally {
      await server.close();
    }
  });

  test("websocket sends per-recipient filtered state sync and action results", async () => {
    const server = await createFixtureMatchHttpServer();
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

      const p1Initial = (await p1Socket.next()) as {
        type?: string;
        cards?: { players?: Record<string, unknown> };
        snapshot?: { players?: Record<string, unknown>; stateSeq?: number };
      };
      const p2Initial = (await p2Socket.next()) as {
        type?: string;
        cards?: { players?: Record<string, unknown> };
        snapshot?: { players?: Record<string, unknown> };
      };

      assert.equal(p1Initial.type, "stateSync");
      assert.deepEqual(Object.keys(p1Initial.snapshot?.players ?? {}), ["p1"]);
      assert.deepEqual(Object.keys(p1Initial.cards?.players ?? {}).sort(), [
        "p1",
        "p2",
      ]);
      assert.deepEqual(Object.keys(p2Initial.snapshot?.players ?? {}), ["p2"]);
      assert.deepEqual(Object.keys(p2Initial.cards?.players ?? {}).sort(), [
        "p1",
        "p2",
      ]);
      const expectedStateSeq = requireStateSeq(p1Initial.snapshot);

      p1Socket.socket.send(
        JSON.stringify({
          type: "submitAction",
          matchId: match.matchId,
          playerId: "p1",
          clientActionId: "client-action-1",
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

      const actionResult = await nextActionResult(p1Socket);
      const p1Update = (await p1Socket.next()) as {
        type?: string;
        snapshot?: { players?: Record<string, unknown> };
      };
      const p2Update = (await p2Socket.next()) as {
        type?: string;
        snapshot?: { players?: Record<string, unknown> };
      };

      assert.equal(actionResult.type, "actionResult");
      assert.equal(actionResult.clientActionId, "client-action-1");
      assert.equal(actionResult.accepted, true);
      assert.equal(p1Update.type, "stateSync");
      assert.equal(p2Update.type, "stateSync");
      assert.deepEqual(Object.keys(p1Update.snapshot?.players ?? {}), ["p1"]);
      assert.deepEqual(Object.keys(p2Update.snapshot?.players ?? {}), ["p2"]);
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await server.close();
    }
  });

  test("rejects websocket messages whose player id does not match the socket seat", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    const sockets: WebSocket[] = [];
    try {
      const match = await createReadyDevMatch(server);
      const p1Token = await claimDevSeat(server, match.matchId, "p1");
      const p1Socket = await openSocket(
        webSocketUrl(server, match.matchId, "p1", p1Token),
      );
      sockets.push(p1Socket.socket);

      const initial = (await p1Socket.next()) as {
        snapshot?: { stateSeq?: number };
      };
      const expectedStateSeq = requireStateSeq(initial.snapshot);
      p1Socket.socket.send(
        JSON.stringify({
          type: "submitAction",
          matchId: match.matchId,
          playerId: "p2",
          clientActionId: "wrong-seat-action",
          actionIndex: 0,
          expectedStateSeq,
          requestHash: requestHash({
            type: "submitAction",
            playerId: "p2" as PlayerId,
            actionIndex: 0,
            expectedStateSeq,
          }),
        }),
      );

      const error = (await p1Socket.next()) as {
        type?: string;
        message?: string;
      };

      assert.equal(error.type, "matchError");
      assert.equal(error.message, "Invalid WebSocket action envelope.");
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await server.close();
    }
  });

  test("rejects duplicate local account claims for the same seat", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const match = await createReadyDevMatch(server);
      await claimDevSeat(server, match.matchId, "p1");

      const duplicate = await fetch(
        `${server.url()}/api/matches/${match.matchId}/seats/p1/claim`,
        { method: "POST" },
      );
      assert.equal(duplicate.status, 401);
      const body = (await duplicate.json()) as { errors?: string[] };
      assert.deepEqual(body.errors, ["Account session is required."]);
    } finally {
      await server.close();
    }
  });

  test("allows idempotent local account claims with the matching seat token", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const match = await createReadyDevMatch(server);
      const token = await claimDevSeat(server, match.matchId, "p1");

      const duplicate = await fetch(
        `${server.url()}/api/matches/${match.matchId}/seats/p1/claim`,
        {
          method: "POST",
          headers: { "x-optcg-session-token": token },
        },
      );

      assert.equal(duplicate.status, 200);
      const body = (await duplicate.json()) as {
        seat?: { playerId?: string; sessionToken?: string };
      };
      assert.deepEqual(body.seat, {
        playerId: "p1",
        sessionToken: token,
      });
    } finally {
      await server.close();
    }
  });

  test("allows account-owned match seat reconnect from a different session", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const match = await createReadyDevMatch(server);
      const originalToken = "user:user-p1:session-original";
      const reconnectToken = "user:user-p1:session-reconnect";

      const originalClaim = await fetch(
        `${server.url()}/api/matches/${match.matchId}/seats/p1/claim`,
        {
          method: "POST",
          headers: { "x-optcg-session-token": originalToken },
        },
      );
      assert.equal(originalClaim.status, 200);

      const reconnect = await fetch(
        `${server.url()}/api/matches/${match.matchId}/seat/claim`,
        {
          method: "POST",
          headers: { "x-optcg-session-token": reconnectToken },
        },
      );

      assert.equal(reconnect.status, 200);
      const body = (await reconnect.json()) as {
        seat?: { playerId?: string; sessionToken?: string };
      };
      assert.deepEqual(body.seat, {
        playerId: "p1",
        sessionToken: reconnectToken,
      });
    } finally {
      await server.close();
    }
  });

  test("reuses a supplied local account token when claiming an unclaimed seat", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const match = await createReadyDevMatch(server);
      const token = "user:user-p1:session-existing";

      const claim = await fetch(
        `${server.url()}/api/matches/${match.matchId}/seats/p1/claim`,
        {
          method: "POST",
          headers: { "x-optcg-session-token": token },
        },
      );

      assert.equal(claim.status, 200);
      const body = (await claim.json()) as {
        seat?: { playerId?: string; sessionToken?: string };
      };
      assert.deepEqual(body.seat, {
        playerId: "p1",
        sessionToken: token,
      });
    } finally {
      await server.close();
    }
  });

  test("returns not found for unknown local dev match ids", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(
        `${server.url()}/api/matches/missing-match/state`,
      );
      assert.equal(response.status, 404);
      const body = (await response.json()) as { errors?: string[] };
      assert.deepEqual(body.errors, ["Match missing-match not found."]);
    } finally {
      await server.close();
    }
  });

  test("does not expose legacy default match state over REST", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/state`);
      assert.equal(response.status, 404);
      const body = (await response.json()) as { errors?: string[] };
      assert.deepEqual(body.errors, ["API route not found."]);
    } finally {
      await server.close();
    }
  });

  test("does not expose legacy default card metadata over REST", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/cards`);
      assert.equal(response.status, 404);
      const body = (await response.json()) as { errors?: string[] };
      assert.deepEqual(body.errors, ["API route not found."]);
    } finally {
      await server.close();
    }
  });

  test("does not expose match-specific state or card metadata over REST", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const stateResponse = await fetch(
        `${server.url()}/api/matches/dev-local-match/state`,
      );
      assert.equal(stateResponse.status, 404);
      const stateBody = (await stateResponse.json()) as { errors?: string[] };
      assert.deepEqual(stateBody.errors, ["API route not found."]);

      const cardsResponse = await fetch(
        `${server.url()}/api/matches/dev-local-match/cards`,
      );
      assert.equal(cardsResponse.status, 404);
      const cardsBody = (await cardsResponse.json()) as { errors?: string[] };
      assert.deepEqual(cardsBody.errors, ["API route not found."]);
    } finally {
      await server.close();
    }
  });

  test("accepts websocket decision responses without exposing hidden manifest data", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    const sockets: WebSocket[] = [];
    try {
      const match = await createReadyDevMatch(server);
      const p1Token = await claimDevSeat(server, match.matchId, "p1");
      const p1Socket = await openSocket(
        webSocketUrl(server, match.matchId, "p1", p1Token),
      );
      sockets.push(p1Socket.socket);
      const stateBody = (await p1Socket.next()) as {
        snapshot?: {
          stateSeq?: number;
          players?: Record<
            string,
            {
              view?: {
                pendingDecision?: {
                  id?: string;
                  type?: string;
                  candidates?: Array<{ card?: CardRef }>;
                };
              };
            }
          >;
        };
      };
      const decision =
        stateBody.snapshot?.players?.["p1"]?.view?.pendingDecision;
      assert.equal(decision?.type, "selectCards");
      const candidate = decision.candidates?.[0]?.card;
      if (decision.id === undefined || candidate === undefined) {
        throw new Error("Missing filtered setup decision candidate.");
      }
      const decisionId = decision.id as DecisionId;
      const expectedStateSeq = requireStateSeq(stateBody.snapshot);

      p1Socket.socket.send(
        JSON.stringify({
          type: "respondToDecision",
          matchId: match.matchId,
          playerId: "p1",
          clientActionId: "decision-action",
          decisionId,
          expectedDecisionId: decisionId,
          expectedStateSeq,
          response: { type: "cards", cards: [candidate] },
          requestHash: requestHash({
            type: "respondToDecision",
            playerId: "p1" as PlayerId,
            decisionId,
            response: { type: "cards", cards: [candidate] },
          }),
        }),
      );
      const actionResult = (await p1Socket.next()) as {
        type?: string;
        accepted?: boolean;
        errors?: string[];
      };
      const update = await p1Socket.next();
      const serialized = JSON.stringify({ actionResult, update });

      assert.equal(actionResult.type, "actionResult");
      assert.equal(actionResult.accepted, true);
      assert.deepEqual(actionResult.errors, []);
      assert.equal(serialized.includes("cardManifest"), false);
      assert.equal(serialized.includes("effectDefinitions"), false);
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await server.close();
    }
  });

  test("returns the stored decision result when a decision response is retried after resolution", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    const sockets: WebSocket[] = [];
    try {
      const match = await createReadyDevMatch(server);
      const p1Token = await claimDevSeat(server, match.matchId, "p1");
      const p1Socket = await openSocket(
        webSocketUrl(server, match.matchId, "p1", p1Token),
      );
      sockets.push(p1Socket.socket);
      const stateBody = (await p1Socket.next()) as {
        snapshot?: {
          stateSeq?: number;
          players?: Record<
            string,
            {
              view?: {
                pendingDecision?: {
                  id?: string;
                  candidates?: Array<{ card?: CardRef }>;
                };
              };
            }
          >;
        };
      };
      const decision =
        stateBody.snapshot?.players?.["p1"]?.view?.pendingDecision;
      const candidate = decision?.candidates?.[0]?.card;
      if (decision?.id === undefined || candidate === undefined) {
        throw new Error("Missing filtered setup decision candidate.");
      }
      const decisionId = decision.id as DecisionId;
      const expectedStateSeq = requireStateSeq(stateBody.snapshot);
      const payload = {
        type: "respondToDecision",
        matchId: match.matchId,
        playerId: "p1",
        clientActionId: "decision-retry-action",
        decisionId,
        expectedDecisionId: decisionId,
        expectedStateSeq,
        response: { type: "cards", cards: [candidate] },
        requestHash: requestHash({
          type: "respondToDecision",
          playerId: "p1" as PlayerId,
          decisionId,
          response: { type: "cards", cards: [candidate] },
        }),
      };

      p1Socket.socket.send(JSON.stringify(payload));
      const firstResult = (await p1Socket.next()) as {
        type?: string;
        accepted?: boolean;
        errors?: string[];
      };
      await p1Socket.next();
      p1Socket.socket.send(JSON.stringify(payload));
      const retryResult = (await p1Socket.next()) as {
        type?: string;
        accepted?: boolean;
        errors?: string[];
      };

      assert.equal(firstResult.type, "actionResult");
      assert.equal(firstResult.accepted, true);
      assert.equal(retryResult.type, "actionResult");
      assert.equal(retryResult.accepted, true);
      assert.deepEqual(retryResult.errors, []);
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await server.close();
    }
  });

  test("rejects websocket decision responses from the wrong player", async () => {
    const server = await createFixtureMatchHttpServer();
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
      const p1State = (await p1Socket.next()) as {
        snapshot?: {
          stateSeq?: number;
          players?: Record<
            string,
            { view?: { pendingDecision?: { id?: string } } }
          >;
        };
      };
      await p2Socket.next();
      const decisionId =
        p1State.snapshot?.players?.["p1"]?.view?.pendingDecision?.id;
      if (decisionId === undefined) {
        throw new Error("Missing p1 pending decision.");
      }
      const expectedStateSeq = requireStateSeq(p1State.snapshot);

      p2Socket.socket.send(
        JSON.stringify({
          type: "respondToDecision",
          matchId: match.matchId,
          playerId: "p2",
          clientActionId: "wrong-player-decision",
          decisionId: decisionId as DecisionId,
          expectedDecisionId: decisionId as DecisionId,
          expectedStateSeq,
          response: { type: "cards", cards: [] },
          requestHash: requestHash({
            type: "respondToDecision",
            playerId: "p2" as PlayerId,
            decisionId: decisionId as DecisionId,
            response: { type: "cards", cards: [] },
          }),
        }),
      );
      const actionResult = (await p2Socket.next()) as { errors?: string[] };

      assert.deepEqual(actionResult.errors, [
        `Decision ${decisionId} is not pending for p2.`,
      ]);
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await server.close();
    }
  });

  test("accepts an explicit premade match setup through reset", async () => {
    const server = await createFixtureMatchHttpServer();
    const setup = await createFixtureDevMatchSetup();
    const custom = {
      ...setup,
      matchId: "dev-http-custom-match",
      rngSeed: "dev-http-custom-seed",
      cardManifest: {
        ...setup.cardManifest,
        manifestHash: "dev-http-custom-manifest",
      },
    };
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setup: custom }),
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as { stateHash?: string };
      assert.equal(typeof body.stateHash, "string");

      const serialized = JSON.stringify(body);
      assert.equal(serialized.includes("dev-http-custom-manifest"), false);
      assert.equal(serialized.includes("cardManifest"), false);
    } finally {
      await server.close();
    }
  });

  test("does not expose lobby URL-selected seat claim routes", async () => {
    const source = await readFile(
      join(sourceDirectory, "match-http-server.ts"),
      "utf8",
    );

    assert.doesNotMatch(source, /\/api\/lobbies\/.*\/seats/u);
    assert.doesNotMatch(source, /claimSeat\(lobbyId,\s*playerId/u);
  });
});
