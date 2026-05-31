import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { DeckHashDeck } from "optcg-deck-hash";

import { createDevHttpServer } from "./dev-http-server.js";
import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";

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

interface TestSocket {
  socket: WebSocket;
  next: () => Promise<unknown>;
}

const createDeckHashDevHttpServer = async () =>
  createDevHttpServer({
    setup: await createFixtureDevMatchSetup(),
    fetchCard: createDefaultDevFixtureFetch(),
    deckHashCodec: {
      decode: (hash): Promise<DeckHashDeck> =>
        Promise.resolve(
          hash === "p1-hash"
            ? {
                leader: { card_number: "OP13-079", count: 1 },
                main: [{ card_number: "OP13-080", count: 8 }],
                don: null,
              }
            : hash === "bad-cache-hash"
              ? {
                  leader: { card_number: "OP13-079", count: 1 },
                  main: [{ card_number: "BAD-001", count: 8 }],
                  don: null,
                }
              : {
                  leader: { card_number: "OP13-079", count: 1 },
                  main: [{ card_number: "OP13-082", count: 8 }],
                  don: null,
                },
        ),
    },
  });

const createDevLobby = async (
  server: Awaited<ReturnType<typeof createDeckHashDevHttpServer>>,
): Promise<CreatedDevLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies`, {
    method: "POST",
  });
  assert.equal(response.status, 201);
  return (await response.json()) as CreatedDevLobbyBody;
};

const joinDevLobby = async (
  server: Awaited<ReturnType<typeof createDeckHashDevHttpServer>>,
  lobbyId: string,
  guestToken: string,
): Promise<CreatedDevLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies/${lobbyId}/join`, {
    method: "POST",
    headers: { "x-optcg-session-token": guestToken },
  });
  assert.equal(response.status, 200);
  return (await response.json()) as CreatedDevLobbyBody;
};

const submitDevLobbyDeck = async (
  server: Awaited<ReturnType<typeof createDeckHashDevHttpServer>>,
  lobbyId: string,
  guestToken: string,
  deckHash: string,
): Promise<CreatedDevLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies/${lobbyId}/deck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-optcg-session-token": guestToken,
    },
    body: JSON.stringify({ deckHash }),
  });
  assert.equal(response.status, 200);
  return (await response.json()) as CreatedDevLobbyBody;
};

const lobbyWebSocketUrl = (
  server: Awaited<ReturnType<typeof createDeckHashDevHttpServer>>,
  lobbyId: string,
  playerId: string,
): string => {
  const url = new URL(
    `/api/lobbies/${encodeURIComponent(lobbyId)}/ws`,
    server.url().replace(/^http/u, "ws"),
  );
  url.searchParams.set("playerId", playerId);
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

describe("dev HTTP lobby deck submissions", () => {
  test("custom lobby waits for both claimed seats and ready deck submissions", async () => {
    const server = await createDeckHashDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createDevLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }
      assert.equal(created.matchId, undefined);
      assert.equal(created.seats["p1"]?.claimed, false);
      assert.equal(created.seats["p2"]?.claimed, false);
      assert.equal(requireLobbySeat(created, "p1").deck.status, "missing");
      assert.equal(requireLobbySeat(created, "p2").deck.status, "missing");

      const oneSeat = await joinDevLobby(server, lobbyId, "guest-p1");
      assert.equal(oneSeat.matchId, undefined);
      assert.equal(oneSeat.seat?.playerId, "p1");
      assert.equal(requireLobbySeat(oneSeat, "p1").deck.status, "missing");

      const twoSeats = await joinDevLobby(server, lobbyId, "guest-p2");
      assert.equal(twoSeats.matchId, undefined);
      assert.equal(twoSeats.seats["p1"]?.claimed, true);
      assert.equal(twoSeats.seats["p2"]?.claimed, true);

      const oneDeck = await submitDevLobbyDeck(
        server,
        lobbyId,
        "guest-p1",
        "p1-hash",
      );
      assert.equal(oneDeck.matchId, undefined);
      assert.equal(requireLobbySeat(oneDeck, "p1").deck.status, "ready");
      assert.equal(requireLobbySeat(oneDeck, "p2").deck.status, "missing");

      const ready = await submitDevLobbyDeck(
        server,
        lobbyId,
        "guest-p2",
        "p2-hash",
      );
      const matchId = ready.matchId;
      if (matchId === undefined) {
        throw new Error("Ready lobby response did not include a match id.");
      }
      assert.equal(requireLobbySeat(ready, "p1").deck.status, "ready");
      assert.equal(requireLobbySeat(ready, "p2").deck.status, "ready");

      const matchState = await fetch(
        `${server.url()}/api/matches/${matchId}/state`,
      );
      assert.equal(matchState.status, 409);
    } finally {
      await server.close();
    }
  });

  test("pushes lobby readiness to an already-waiting seat when the second deck is ready", async () => {
    const server = await createDeckHashDevHttpServer();
    await server.listen(0, "127.0.0.1");
    const sockets: WebSocket[] = [];
    try {
      const created = await createDevLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }
      await joinDevLobby(server, lobbyId, "guest-p1");
      const p1LobbySocket = await openSocket(
        lobbyWebSocketUrl(server, lobbyId, "p1"),
      );
      sockets.push(p1LobbySocket.socket);

      const initial = (await p1LobbySocket.next()) as {
        type?: string;
        lobby?: CreatedDevLobbyBody;
      };
      assert.equal(initial.type, "lobbySync");
      assert.equal(initial.lobby?.matchId, undefined);

      await joinDevLobby(server, lobbyId, "guest-p2");
      const joinUpdate = (await p1LobbySocket.next()) as {
        type?: string;
        lobby?: CreatedDevLobbyBody;
      };
      assert.equal(joinUpdate.type, "lobbySync");
      assert.equal(joinUpdate.lobby?.matchId, undefined);

      await submitDevLobbyDeck(server, lobbyId, "guest-p1", "p1-hash");
      const deckUpdate = (await p1LobbySocket.next()) as {
        type?: string;
        lobby?: CreatedDevLobbyBody;
      };
      assert.equal(deckUpdate.type, "lobbySync");
      assert.equal(deckUpdate.lobby?.matchId, undefined);
      if (deckUpdate.lobby === undefined) {
        throw new Error("Deck update did not include lobby state.");
      }
      assert.equal(
        requireLobbySeat(deckUpdate.lobby, "p1").deck.status,
        "ready",
      );

      await submitDevLobbyDeck(server, lobbyId, "guest-p2", "p2-hash");
      const ready = (await p1LobbySocket.next()) as {
        type?: string;
        lobby?: CreatedDevLobbyBody;
      };
      assert.equal(ready.type, "lobbySync");
      const readyLobby = ready.lobby;
      if (readyLobby === undefined) {
        throw new Error("Lobby sync did not include lobby state.");
      }
      assert.equal(requireLobbySeat(readyLobby, "p1").deck.status, "ready");
      assert.equal(requireLobbySeat(readyLobby, "p2").deck.status, "ready");
      assert.equal(typeof readyLobby.matchId, "string");
    } finally {
      for (const socket of sockets) {
        socket.close();
      }
      await server.close();
    }
  });

  test("lobby deck status does not expose deck contents to the other guest", async () => {
    const server = await createDeckHashDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createDevLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      await joinDevLobby(server, lobbyId, "guest-a");
      await submitDevLobbyDeck(server, lobbyId, "guest-a", "p1-hash");
      const response = await fetch(`${server.url()}/api/lobbies/${lobbyId}`);
      assert.equal(response.status, 200);
      const lobby = (await response.json()) as CreatedDevLobbyBody;

      assert.equal(JSON.stringify(lobby).includes("OP13-079"), false);
      assert.equal(JSON.stringify(lobby).includes("p1-hash"), false);
      assert.equal(requireLobbySeat(lobby, "p1").deck.status, "ready");
      assert.equal(requireLobbySeat(lobby, "p2").deck.status, "missing");
    } finally {
      await server.close();
    }
  });

  test("declines decoded deck hashes that do not resolve through the card cache", async () => {
    const server = await createDeckHashDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createDevLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      await joinDevLobby(server, lobbyId, "guest-a");
      const response = await fetch(
        `${server.url()}/api/lobbies/${lobbyId}/deck`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-optcg-session-token": "guest-a",
          },
          body: JSON.stringify({ deckHash: "bad-cache-hash" }),
        },
      );
      assert.equal(response.status, 400);

      const lobbyResponse = await fetch(
        `${server.url()}/api/lobbies/${lobbyId}`,
      );
      assert.equal(lobbyResponse.status, 200);
      const lobby = (await lobbyResponse.json()) as CreatedDevLobbyBody;
      assert.equal(requireLobbySeat(lobby, "p1").deck.status, "missing");
      assert.equal(lobby.matchId, undefined);
    } finally {
      await server.close();
    }
  });
});
