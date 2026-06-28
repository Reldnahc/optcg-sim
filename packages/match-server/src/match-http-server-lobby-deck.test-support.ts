import { strict as assert } from "node:assert";
import type { DeckHashDeck } from "optcg-deck-hash";

import { createMatchHttpServer } from "./match-http-server.js";
import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";
import type { SimHandoffVerifier, VerifiedSimHandoff } from "./sim-handoff.js";

export interface CreatedCustomLobbyBody {
  lobbyId?: string;
  settings?: {
    formatId?: string;
    timerDisabled?: boolean;
    botOpponent?: boolean;
    botBehavior?: "passive";
  };
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

export const requireLobbySeat = (
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

export const createDeckHashMatchHttpServer = async () =>
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
              : hash === "short-deck-hash"
                ? {
                    leader: { card_number: "OP13-079", count: 1 },
                    main: [{ card_number: "OP13-080", count: 49 }],
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

export const verifiedHandoff = (
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

export const createHandoffMatchHttpServer = async (
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

export const createCustomLobby = async (
  server: Awaited<ReturnType<typeof createDeckHashMatchHttpServer>>,
  settings?: {
    formatId: string;
    timerDisabled?: boolean;
    botOpponent?: boolean;
    botBehavior?: "passive";
  },
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

export const joinCustomLobby = async (
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

export const submitCustomLobbyDeck = async (
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

export const submitCustomLobbyLoadout = async (
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

export interface ValidatedLobbyLoadoutsBody {
  data?: {
    loadouts?: Array<{
      loadoutId: string | null;
      status: "playable" | "unplayable" | "unverified";
      errors: string[];
    }>;
  };
  errors?: string[];
}

export const validateCustomLobbyLoadouts = async (
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

export const validateCustomLobbyDecks = async (
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

export const waitForMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

export const delayMs = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
};

export const waitForStartedDecode = async (
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

export const lobbyWebSocketUrl = (
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

export const openSocket = async (url: string): Promise<TestSocket> =>
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
