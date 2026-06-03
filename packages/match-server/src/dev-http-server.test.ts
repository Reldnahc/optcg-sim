import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import type { CardRef, DecisionId, PlayerId } from "@optcg/types";

import { createDevHttpServer } from "./dev-http-server.js";
import { websocketTextFrame } from "./dev-http-server.js";
import { requestHash } from "./action-envelope.js";
import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";

const createFixtureDevHttpServer = async () =>
  createDevHttpServer({
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

interface CreatedDevLobbyBody {
  lobbyId?: string;
  matchId?: string;
  seat?: { playerId?: string };
  seats: Record<
    string,
    {
      playerId?: string;
      claimed?: boolean;
      deck: { status: "missing" | "ready" | "invalid" };
    }
  >;
  errors?: string[];
}

const requireLobbySeat = (
  lobby: CreatedDevLobbyBody,
  seatId: string,
): CreatedDevLobbyBody["seats"][string] => {
  const seat = lobby.seats[seatId];
  if (seat === undefined) {
    throw new Error(`Lobby response was missing ${seatId}.`);
  }
  return seat;
};

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

interface TestSocket {
  socket: WebSocket;
  next: () => Promise<unknown>;
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
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
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
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
  matchId: string,
  playerId: "p1" | "p2",
): Promise<string> => {
  const sessionToken = `user:user-${playerId}:session-1`;
  return claimDevSeatWithToken(server, matchId, playerId, sessionToken);
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

const createDevLobby = async (
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
): Promise<CreatedDevLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies`, {
    method: "POST",
  });
  assert.equal(response.status, 201);
  return (await response.json()) as CreatedDevLobbyBody;
};

const joinDevLobby = async (
  server: Awaited<ReturnType<typeof createFixtureDevHttpServer>>,
  lobbyId: string,
  sessionToken: string,
): Promise<CreatedDevLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies/${lobbyId}/join`, {
    method: "POST",
    headers: { "x-optcg-session-token": sessionToken },
  });
  assert.equal(response.status, 200);
  return (await response.json()) as CreatedDevLobbyBody;
};

describe("dev HTTP server", () => {
  test("does not serve the legacy static match UI", async () => {
    const server = await createFixtureDevHttpServer();
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

  test("seatless lobby join assigns first open seat by account session", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createDevLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      const first = await joinDevLobby(
        server,
        lobbyId,
        "user:user-a:session-1",
      );
      const second = await joinDevLobby(
        server,
        lobbyId,
        "user:user-b:session-1",
      );

      assert.equal(first.seat?.playerId, "p1");
      assert.equal(second.seat?.playerId, "p2");
      assert.equal(second.matchId, undefined);
      assert.equal(first.seats["p1"]?.claimed, true);
      assert.equal(second.seats["p2"]?.claimed, true);
      assert.equal(requireLobbySeat(second, "p1").deck.status, "missing");
      assert.equal(requireLobbySeat(second, "p2").deck.status, "missing");
    } finally {
      await server.close();
    }
  });

  test("seatless lobby join is idempotent for the same account session", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createDevLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      const first = await joinDevLobby(
        server,
        lobbyId,
        "user:user-a:session-1",
      );
      const second = await joinDevLobby(
        server,
        lobbyId,
        "user:user-a:session-1",
      );

      assert.equal(first.seat?.playerId, "p1");
      assert.equal(second.seat?.playerId, "p1");
      assert.equal(second.matchId, undefined);
    } finally {
      await server.close();
    }
  });

  test("seatless lobby join fails closed when the lobby is full", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createDevLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      await joinDevLobby(server, lobbyId, "user:user-a:session-1");
      await joinDevLobby(server, lobbyId, "user:user-b:session-1");
      const response = await fetch(
        `${server.url()}/api/lobbies/${lobbyId}/join`,
        {
          method: "POST",
          headers: { "x-optcg-session-token": "user:user-c:session-1" },
        },
      );
      const body = (await response.json()) as CreatedDevLobbyBody;

      assert.equal(response.status, 409);
      assert.deepEqual(body.errors, ["Lobby is full."]);
    } finally {
      await server.close();
    }
  });

  test("lobby join responses do not expose account session tokens", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createDevLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      const joined = await joinDevLobby(
        server,
        lobbyId,
        "user:user-a:session-1",
      );

      assert.equal(
        JSON.stringify(joined).includes("user:user-a:session-1"),
        false,
      );
    } finally {
      await server.close();
    }
  });

  test("creates independent local authenticated dev matches keyed by matchId", async () => {
    const server = await createFixtureDevHttpServer();
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

      const firstStateResponse = await fetch(
        `${server.url()}/api/matches/${first.matchId}/state`,
      );
      const secondStateResponse = await fetch(
        `${server.url()}/api/matches/${second.matchId}/state`,
      );
      assert.equal(firstStateResponse.status, 200);
      assert.equal(secondStateResponse.status, 200);
      const firstState = (await firstStateResponse.json()) as {
        stateSeq?: number;
      };
      const secondState = (await secondStateResponse.json()) as {
        stateSeq?: number;
      };
      assert.notEqual(firstState.stateSeq, secondState.stateSeq);
      assert.equal(secondState.stateSeq, second.stateSeq);
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await server.close();
    }
  });

  test("does not expose HTTP gameplay action or decision routes", async () => {
    const server = await createFixtureDevHttpServer();
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

      const actionResult = (await p1Socket.next()) as {
        type?: string;
        accepted?: boolean;
        clientActionId?: string;
      };
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
    const server = await createFixtureDevHttpServer();
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
    const server = await createFixtureDevHttpServer();
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
    const server = await createFixtureDevHttpServer();
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

  test("reuses a supplied local account token when claiming an unclaimed seat", async () => {
    const server = await createFixtureDevHttpServer();
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
    const server = await createFixtureDevHttpServer();
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

  test("serves filtered match state without exposing the engine state", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/state`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as unknown;
      const serialized = JSON.stringify(body);

      assert.ok(serialized.includes('"players"'));
      assert.equal(serialized.includes("cardManifest"), false);
      assert.equal(serialized.includes('"opponent":{"playerId":"p2"'), true);
      assert.equal(serialized.includes('"handCount"'), true);
    } finally {
      await server.close();
    }
  });

  test("serves public card metadata for browser board images", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/cards`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        players?: Record<
          string,
          { cards?: Record<string, { name?: string; imageUrl?: string }> }
        >;
      };
      const p1Catalog = body.players?.["p1"]?.cards;
      const p2Catalog = body.players?.["p2"]?.cards;
      const imu = p1Catalog?.["OP13-079"];
      if (imu === undefined) {
        throw new Error("Missing OP13-079 card metadata.");
      }

      assert.equal(imu.name, "Imu");
      assert.equal(imu.imageUrl?.startsWith("https://"), true);
      assert.equal(p1Catalog?.["OP13-080"], undefined);
      assert.equal(p2Catalog?.["OP13-080"], undefined);
      assert.equal(JSON.stringify(body).includes("effectDefinitions"), false);
      assert.equal(JSON.stringify(body).includes("cardManifest"), false);
    } finally {
      await server.close();
    }
  });

  test("accepts websocket decision responses without exposing hidden manifest data", async () => {
    const server = await createFixtureDevHttpServer();
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
    const server = await createFixtureDevHttpServer();
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
    const server = await createFixtureDevHttpServer();
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

      const stateResponse = await fetch(`${server.url()}/api/state`);
      const stateBody = await stateResponse.text();
      assert.equal(stateBody.includes("dev-http-custom-manifest"), false);
      assert.equal(stateBody.includes("cardManifest"), false);
    } finally {
      await server.close();
    }
  });

  test("does not expose lobby URL-selected seat claim routes", async () => {
    const source = await readFile(
      join(sourceDirectory, "dev-http-server.ts"),
      "utf8",
    );

    assert.doesNotMatch(source, /\/api\/lobbies\/.*\/seats/u);
    assert.doesNotMatch(source, /claimSeat\(lobbyId,\s*playerId/u);
  });
});
