import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { DeckHashDeck } from "optcg-deck-hash";

import { createMatchHttpServer } from "./match-http-server.js";
import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";
import type { SimHandoffVerifier, VerifiedSimHandoff } from "./sim-handoff.js";

interface CreatedCustomLobbyBody {
  lobbyId?: string;
  settings?: { formatId?: string };
  matchId?: string;
  seat?: { playerId?: string; sessionToken?: string };
  sessionToken?: string;
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
  lobby: CreatedCustomLobbyBody,
  seatId: string,
): CreatedCustomLobbyBody["seats"][string] => {
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

const createDeckHashMatchHttpServer = async () =>
  createMatchHttpServer({
    setup: await createFixtureDevMatchSetup(),
    fetchCard: createDefaultDevFixtureFetch(),
    deckHashCodec: {
      decode: (hash): Promise<DeckHashDeck> =>
        Promise.resolve(
          hash === "p1-hash"
            ? {
                leader: { card_number: "OP13-079", count: 1 },
                main: [{ card_number: "OP13-080", count: 50 }],
                don: null,
              }
            : hash === "bad-cache-hash"
              ? {
                  leader: { card_number: "OP13-079", count: 1 },
                  main: [{ card_number: "BAD-001", count: 50 }],
                  don: null,
                }
              : {
                  leader: { card_number: "OP13-079", count: 1 },
                  main: [{ card_number: "OP13-082", count: 50 }],
                  don: null,
                },
        ),
    },
  });

const verifiedHandoff = (
  overrides: Partial<VerifiedSimHandoff> = {},
): VerifiedSimHandoff => ({
  claims: {
    jti: "token-1",
    sub: "user-1",
    sid: "session-1",
    loadout_id: "loadout-1",
    lobby_id: null,
    seat_id: null,
    aud: "optcg-sim",
    iat: 1,
    exp: 2,
    ...overrides.claims,
  },
  resolvedLoadout: {
    loadoutId: "loadout-1",
    userId: "user-1",
    mainDeck: {
      deckId: "deck-1",
      hash: "deck-hash",
    },
    donDeck: {
      donDeckId: "don-1",
      count: 10,
    },
    cosmetics: {
      playmatId: "playmat-1",
      donSleeveId: "don-sleeve-1",
      deckSleeveId: "deck-sleeve-1",
    },
  },
  ...overrides,
});

const createHandoffMatchHttpServer = async (
  verifier: SimHandoffVerifier,
  decodedHashes: string[],
) =>
  createMatchHttpServer({
    setup: await createFixtureDevMatchSetup(),
    fetchCard: createDefaultDevFixtureFetch(),
    simHandoffVerifier: verifier,
    deckHashCodec: {
      decode(hash): Promise<DeckHashDeck> {
        decodedHashes.push(hash);
        return Promise.resolve({
          leader: { card_number: "OP13-079", count: 1 },
          main: [{ card_number: "OP13-080", count: 50 }],
          don: null,
        });
      },
    },
  });

const createCustomLobby = async (
  server: Awaited<ReturnType<typeof createDeckHashMatchHttpServer>>,
  settings?: { formatId: string },
): Promise<CreatedCustomLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies`, {
    method: "POST",
    ...(settings === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ settings }),
        }),
  });
  assert.equal(response.status, 201);
  return (await response.json()) as CreatedCustomLobbyBody;
};

const joinCustomLobby = async (
  server: Awaited<ReturnType<typeof createDeckHashMatchHttpServer>>,
  lobbyId: string,
  sessionToken: string,
): Promise<CreatedCustomLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies/${lobbyId}/join`, {
    method: "POST",
    headers: { "x-optcg-session-token": sessionToken },
  });
  assert.equal(response.status, 200);
  return (await response.json()) as CreatedCustomLobbyBody;
};

const submitCustomLobbyDeck = async (
  server: Awaited<ReturnType<typeof createDeckHashMatchHttpServer>>,
  lobbyId: string,
  sessionToken: string,
  deckHash: string,
  donDeckCount = 10,
): Promise<CreatedCustomLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies/${lobbyId}/deck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-optcg-session-token": sessionToken,
    },
    body: JSON.stringify({ deckHash, donDeckCount }),
  });
  assert.equal(response.status, 200);
  return (await response.json()) as CreatedCustomLobbyBody;
};

const submitCustomLobbyLoadout = async (
  server: Awaited<ReturnType<typeof createDeckHashMatchHttpServer>>,
  lobbyId: string,
  handoffToken: string,
): Promise<CreatedCustomLobbyBody> => {
  const response = await fetch(
    `${server.url()}/api/lobbies/${lobbyId}/loadout`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handoffToken }),
    },
  );
  assert.equal(response.status, 200);
  return (await response.json()) as CreatedCustomLobbyBody;
};

interface ValidatedLobbyLoadoutsBody {
  data?: {
    loadouts?: Array<{
      loadoutId: string | null;
      status: "playable" | "unplayable" | "unverified";
      errors: string[];
      leaderCardId?: string | null;
      leaderVariantIndex?: number | null;
    }>;
  };
  errors?: string[];
}

const validateCustomLobbyLoadouts = async (
  server: Awaited<ReturnType<typeof createDeckHashMatchHttpServer>>,
  lobbyId: string,
  handoffTokens: readonly string[],
): Promise<ValidatedLobbyLoadoutsBody> => {
  const response = await fetch(
    `${server.url()}/api/lobbies/${lobbyId}/loadouts/validate`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handoffTokens }),
    },
  );
  assert.equal(response.status, 200);
  return (await response.json()) as ValidatedLobbyLoadoutsBody;
};

const validateCustomLobbyDecks = async (
  server: Awaited<ReturnType<typeof createDeckHashMatchHttpServer>>,
  lobbyId: string,
  decks: readonly {
    readonly loadoutId: string;
    readonly deckHash: string;
    readonly donDeckCount: number;
  }[],
): Promise<ValidatedLobbyLoadoutsBody> => {
  const response = await fetch(
    `${server.url()}/api/lobbies/${lobbyId}/decks/validate`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decks }),
    },
  );
  assert.equal(response.status, 200);
  return (await response.json()) as ValidatedLobbyLoadoutsBody;
};

const waitForMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const delayMs = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
};

const waitForStartedDecode = async (
  startedDecodes: readonly string[],
): Promise<void> => {
  for (let attempts = 0; attempts < 50; attempts += 1) {
    if (startedDecodes.length > 0) {
      return;
    }
    await delayMs(1);
  }
  throw new Error("Timed out waiting for deck hash decode to start.");
};

const lobbyWebSocketUrl = (
  server: Awaited<ReturnType<typeof createDeckHashMatchHttpServer>>,
  lobbyId: string,
  playerId: string,
  sessionToken: string,
): string => {
  const url = new URL(
    `/api/lobbies/${encodeURIComponent(lobbyId)}/ws`,
    server.url().replace(/^http/u, "ws"),
  );
  url.searchParams.set("playerId", playerId);
  url.searchParams.set("sessionToken", sessionToken);
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
  test("creates custom lobbies with format settings", async () => {
    const server = await createDeckHashMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const lobby = await createCustomLobby(server, { formatId: "Standard" });

      assert.equal(lobby.settings?.formatId, "Standard");
      if (lobby.lobbyId === undefined) {
        throw new Error("Expected created lobby id.");
      }
      const response = await fetch(
        `${server.url()}/api/lobbies/${lobby.lobbyId}`,
      );
      assert.equal(response.status, 200);
      const loaded = (await response.json()) as CreatedCustomLobbyBody;
      assert.equal(loaded.settings?.formatId, "Standard");
    } finally {
      await server.close();
    }
  });

  test("rejects malformed custom lobby settings", async () => {
    const server = await createDeckHashMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/lobbies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: { formatId: " " } }),
      });
      const body = (await response.json()) as { errors?: string[] };

      assert.equal(response.status, 400);
      assert.deepEqual(body.errors, [
        "Lobby format id must be a non-empty string.",
      ]);
    } finally {
      await server.close();
    }
  });

  test("validates account loadout tokens without claiming a lobby seat", async () => {
    const verifiedTokens: string[] = [];
    const decodedHashes: string[] = [];
    const server = await createMatchHttpServer({
      setup: await createFixtureDevMatchSetup(),
      fetchCard: createDefaultDevFixtureFetch(),
      simHandoffVerifier: {
        verify(token) {
          return Promise.resolve(
            verifiedHandoff({
              resolvedLoadout: {
                ...verifiedHandoff().resolvedLoadout,
                mainDeck: { deckId: "deck-1", hash: token },
              },
            }),
          );
        },
        verifyBatch(tokens) {
          verifiedTokens.push(...tokens);
          return Promise.resolve(
            tokens.map((token) =>
              token === "bad-token"
                ? {
                    status: "rejected" as const,
                    error: "Invalid sim handoff token",
                  }
                : {
                    status: "verified" as const,
                    handoff: verifiedHandoff({
                      claims: {
                        ...verifiedHandoff().claims,
                        loadout_id: token,
                      },
                      resolvedLoadout: {
                        ...verifiedHandoff().resolvedLoadout,
                        loadoutId: token,
                        mainDeck: { deckId: "deck-1", hash: token },
                      },
                    }),
                  },
            ),
          );
        },
      },
      deckHashCodec: {
        decode(hash): Promise<DeckHashDeck> {
          decodedHashes.push(hash);
          return Promise.resolve(
            hash === "loadout-invalid"
              ? {
                  leader: { card_number: "OP13-079", count: 1 },
                  main: [{ card_number: "BAD-001", count: 50 }],
                  don: null,
                }
              : {
                  leader: { card_number: "OP13-079", count: 1 },
                  main: [{ card_number: "OP13-080", count: 50 }],
                  don: null,
                },
          );
        },
      },
    });
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      const result = await validateCustomLobbyLoadouts(server, lobbyId, [
        "loadout-playable",
        "loadout-invalid",
        "bad-token",
      ]);

      assert.deepEqual(verifiedTokens, [
        "loadout-playable",
        "loadout-invalid",
        "bad-token",
      ]);
      assert.deepEqual(decodedHashes, ["loadout-playable", "loadout-invalid"]);
      assert.deepEqual(result.data?.loadouts, [
        {
          loadoutId: "loadout-playable",
          status: "playable",
          errors: [],
          leaderCardId: "OP13-079",
          leaderVariantIndex: null,
        },
        {
          loadoutId: "loadout-invalid",
          status: "unplayable",
          errors: ["Resolved loadout is invalid."],
          leaderCardId: "OP13-079",
          leaderVariantIndex: null,
        },
        {
          loadoutId: null,
          status: "unverified",
          errors: ["Invalid sim handoff token"],
        },
      ]);

      const lobbyResponse = await fetch(
        `${server.url()}/api/lobbies/${lobbyId}`,
      );
      assert.equal(lobbyResponse.status, 200);
      const lobby = (await lobbyResponse.json()) as CreatedCustomLobbyBody;
      assert.equal(requireLobbySeat(lobby, "p1").claimed, false);
      assert.equal(requireLobbySeat(lobby, "p1").deck.status, "missing");
    } finally {
      await server.close();
    }
  });

  test("validates deck hashes for picker preflight without handoff verification", async () => {
    const decodedHashes: string[] = [];
    const server = await createMatchHttpServer({
      setup: await createFixtureDevMatchSetup(),
      fetchCard: createDefaultDevFixtureFetch(),
      simHandoffVerifier: {
        verify() {
          throw new Error("verify was not expected.");
        },
        verifyBatch() {
          throw new Error("verifyBatch was not expected.");
        },
      },
      deckHashCodec: {
        decode(hash): Promise<DeckHashDeck> {
          decodedHashes.push(hash);
          return Promise.resolve(
            hash === "loadout-invalid"
              ? {
                  leader: { card_number: "OP13-079", count: 1 },
                  main: [{ card_number: "BAD-001", count: 50 }],
                  don: null,
                }
              : {
                  leader: { card_number: "OP13-079", count: 1 },
                  main: [{ card_number: "OP13-080", count: 50 }],
                  don: null,
                },
          );
        },
      },
    });
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      const result = await validateCustomLobbyDecks(server, lobbyId, [
        {
          loadoutId: "loadout-playable",
          deckHash: "loadout-playable",
          donDeckCount: 10,
        },
        {
          loadoutId: "loadout-invalid",
          deckHash: "loadout-invalid",
          donDeckCount: 10,
        },
      ]);

      assert.deepEqual(decodedHashes, ["loadout-playable", "loadout-invalid"]);
      assert.deepEqual(result.data?.loadouts, [
        {
          loadoutId: "loadout-playable",
          status: "playable",
          errors: [],
          leaderCardId: "OP13-079",
          leaderVariantIndex: null,
        },
        {
          loadoutId: "loadout-invalid",
          status: "unplayable",
          errors: ["Resolved loadout is invalid."],
          leaderCardId: "OP13-079",
          leaderVariantIndex: null,
        },
      ]);
    } finally {
      await server.close();
    }
  });

  test("starts picker deck hash decodes concurrently during preflight", async () => {
    const startedDecodes: string[] = [];
    const resolveDecode = new Map<string, () => void>();
    let validation: Promise<ValidatedLobbyLoadoutsBody> | undefined;
    const server = await createMatchHttpServer({
      setup: await createFixtureDevMatchSetup(),
      fetchCard: createDefaultDevFixtureFetch(),
      deckHashCodec: {
        async decode(hash): Promise<DeckHashDeck> {
          startedDecodes.push(hash);
          await Promise.race([
            new Promise<void>((resolve) => {
              resolveDecode.set(hash, resolve);
            }),
            delayMs(200),
          ]);
          return {
            leader: { card_number: "OP13-079", count: 1 },
            main: [{ card_number: "OP13-080", count: 50 }],
            don: null,
          };
        },
      },
    });
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      validation = validateCustomLobbyDecks(server, lobbyId, [
        { loadoutId: "slow-a", deckHash: "slow-a", donDeckCount: 10 },
        { loadoutId: "slow-b", deckHash: "slow-b", donDeckCount: 10 },
      ]);
      await waitForStartedDecode(startedDecodes);
      await waitForMicrotasks();

      assert.deepEqual(startedDecodes, ["slow-a", "slow-b"]);

      resolveDecode.get("slow-a")?.();
      resolveDecode.get("slow-b")?.();
      await validation;
    } finally {
      for (const resolve of resolveDecode.values()) {
        resolve();
      }
      await validation?.catch(() => undefined);
      await server.close();
    }
  });

  test("verified account loadout claims a lobby seat without browser-supplied deck data", async () => {
    const verifiedTokens: string[] = [];
    const decodedHashes: string[] = [];
    const server = await createHandoffMatchHttpServer(
      {
        verify(token) {
          verifiedTokens.push(token);
          return Promise.resolve(verifiedHandoff());
        },
        verifyBatch() {
          return Promise.resolve([]);
        },
      },
      decodedHashes,
    );
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      const result = await submitCustomLobbyLoadout(
        server,
        lobbyId,
        "handoff-token",
      );

      assert.deepEqual(verifiedTokens, ["handoff-token"]);
      assert.deepEqual(decodedHashes, ["deck-hash"]);
      const seat = result.seat;
      if (seat === undefined) {
        throw new Error("Expected account handoff to claim a lobby seat.");
      }
      assert.equal(seat.playerId, "p1");
      assert.equal(seat.sessionToken, "user:user-1:session-1");
      assert.equal(requireLobbySeat(result, "p1").claimed, true);
      assert.equal(requireLobbySeat(result, "p1").deck.status, "ready");
      assert.equal(requireLobbySeat(result, "p2").claimed, false);
    } finally {
      await server.close();
    }
  });

  test("custom lobby waits for both claimed seats and ready deck submissions", async () => {
    const server = await createDeckHashMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }
      assert.equal(created.matchId, undefined);
      assert.equal(created.seats["p1"]?.claimed, false);
      assert.equal(created.seats["p2"]?.claimed, false);
      assert.equal(requireLobbySeat(created, "p1").deck.status, "missing");
      assert.equal(requireLobbySeat(created, "p2").deck.status, "missing");

      const oneSeat = await joinCustomLobby(
        server,
        lobbyId,
        "user:user-p1:session-1",
      );
      assert.equal(oneSeat.matchId, undefined);
      assert.equal(oneSeat.seat?.playerId, "p1");
      assert.equal(requireLobbySeat(oneSeat, "p1").deck.status, "missing");

      const twoSeats = await joinCustomLobby(
        server,
        lobbyId,
        "user:user-p2:session-1",
      );
      assert.equal(twoSeats.matchId, undefined);
      assert.equal(twoSeats.seats["p1"]?.claimed, true);
      assert.equal(twoSeats.seats["p2"]?.claimed, true);

      const oneDeck = await submitCustomLobbyDeck(
        server,
        lobbyId,
        "user:user-p1:session-1",
        "p1-hash",
      );
      assert.equal(oneDeck.matchId, undefined);
      assert.equal(requireLobbySeat(oneDeck, "p1").deck.status, "ready");
      assert.equal(requireLobbySeat(oneDeck, "p2").deck.status, "missing");

      const ready = await submitCustomLobbyDeck(
        server,
        lobbyId,
        "user:user-p2:session-1",
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

  test("can disable raw deck hash submissions for non-local environments", async () => {
    const decodedHashes: string[] = [];
    const server = await createMatchHttpServer({
      setup: await createFixtureDevMatchSetup(),
      fetchCard: createDefaultDevFixtureFetch(),
      allowRawDeckHashSubmissions: false,
      deckHashCodec: {
        decode(hash): Promise<DeckHashDeck> {
          decodedHashes.push(hash);
          return Promise.resolve({
            leader: { card_number: "OP13-079", count: 1 },
            main: [{ card_number: "OP13-080", count: 50 }],
            don: null,
          });
        },
      },
    });
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }
      await joinCustomLobby(server, lobbyId, "user:user-p1:session-1");

      const response = await fetch(
        `${server.url()}/api/lobbies/${lobbyId}/deck`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-optcg-session-token": "user:user-p1:session-1",
          },
          body: JSON.stringify({
            deckHash: "raw-local-only",
            donDeckCount: 10,
          }),
        },
      );

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        errors: ["Raw deck hash submissions are only available locally."],
      });
      assert.deepEqual(decodedHashes, []);
    } finally {
      await server.close();
    }
  });

  test("pushes lobby readiness to an already-waiting seat when the second deck is ready", async () => {
    const server = await createDeckHashMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    const sockets: WebSocket[] = [];
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }
      await joinCustomLobby(server, lobbyId, "user:user-p1:session-1");
      const p1LobbySocket = await openSocket(
        lobbyWebSocketUrl(server, lobbyId, "p1", "user:user-p1:session-1"),
      );
      sockets.push(p1LobbySocket.socket);

      const initial = (await p1LobbySocket.next()) as {
        type?: string;
        lobby?: CreatedCustomLobbyBody;
      };
      assert.equal(initial.type, "lobbySync");
      assert.equal(initial.lobby?.matchId, undefined);

      await joinCustomLobby(server, lobbyId, "user:user-p2:session-1");
      const joinUpdate = (await p1LobbySocket.next()) as {
        type?: string;
        lobby?: CreatedCustomLobbyBody;
      };
      assert.equal(joinUpdate.type, "lobbySync");
      assert.equal(joinUpdate.lobby?.matchId, undefined);

      await submitCustomLobbyDeck(
        server,
        lobbyId,
        "user:user-p1:session-1",
        "p1-hash",
      );
      const deckUpdate = (await p1LobbySocket.next()) as {
        type?: string;
        lobby?: CreatedCustomLobbyBody;
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

      await submitCustomLobbyDeck(
        server,
        lobbyId,
        "user:user-p2:session-1",
        "p2-hash",
      );
      const ready = (await p1LobbySocket.next()) as {
        type?: string;
        lobby?: CreatedCustomLobbyBody;
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

  test("rejects lobby websocket subscriptions for another account seat", async () => {
    const server = await createDeckHashMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }
      await joinCustomLobby(server, lobbyId, "user:user-p1:session-1");

      await assert.rejects(
        () =>
          openSocket(
            lobbyWebSocketUrl(server, lobbyId, "p1", "user:user-p2:session-1"),
          ),
        /WebSocket failed to open/u,
      );
    } finally {
      await server.close();
    }
  });

  test("lobby deck status does not expose deck contents to the other player", async () => {
    const server = await createDeckHashMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      await joinCustomLobby(server, lobbyId, "user:user-a:session-1");
      await submitCustomLobbyDeck(
        server,
        lobbyId,
        "user:user-a:session-1",
        "p1-hash",
      );
      const response = await fetch(`${server.url()}/api/lobbies/${lobbyId}`);
      assert.equal(response.status, 200);
      const lobby = (await response.json()) as CreatedCustomLobbyBody;

      assert.equal(JSON.stringify(lobby).includes("OP13-079"), false);
      assert.equal(JSON.stringify(lobby).includes("p1-hash"), false);
      assert.equal(requireLobbySeat(lobby, "p1").deck.status, "ready");
      assert.equal(requireLobbySeat(lobby, "p2").deck.status, "missing");
    } finally {
      await server.close();
    }
  });

  test("declines decoded deck hashes that do not resolve through the card cache", async () => {
    const server = await createDeckHashMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      await joinCustomLobby(server, lobbyId, "user:user-a:session-1");
      const response = await fetch(
        `${server.url()}/api/lobbies/${lobbyId}/deck`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-optcg-session-token": "user:user-a:session-1",
          },
          body: JSON.stringify({
            deckHash: "bad-cache-hash",
            donDeckCount: 10,
          }),
        },
      );
      assert.equal(response.status, 400);

      const lobbyResponse = await fetch(
        `${server.url()}/api/lobbies/${lobbyId}`,
      );
      assert.equal(lobbyResponse.status, 200);
      const lobby = (await lobbyResponse.json()) as CreatedCustomLobbyBody;
      assert.equal(requireLobbySeat(lobby, "p1").deck.status, "missing");
      assert.equal(lobby.matchId, undefined);
    } finally {
      await server.close();
    }
  });
});
