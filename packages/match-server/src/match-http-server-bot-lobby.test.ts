import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { DeckHashDeck } from "optcg-deck-hash";

import { createMatchHttpServer } from "./match-http-server.js";
import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";

interface CreatedCustomLobbyBody {
  lobbyId?: string;
  settings?: {
    botOpponent?: boolean;
  };
  matchId?: string;
  seat?: { playerId?: string; sessionToken?: string };
  seats: Record<
    string,
    {
      playerId?: string;
      claimed?: boolean;
      deck: { status: "missing" | "ready" | "invalid" };
    }
  >;
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

interface ClaimedMatchSeatBody {
  seat?: { sessionToken?: string };
  firstPlayerChoice?: {
    chooserPlayerId?: string;
    choices?: string[];
  };
}

interface CreatedMatchBody {
  snapshot?: {
    status?: string;
    playerLabels?: Record<string, { displayName?: string }>;
  };
}

const requireSnapshot = (
  body: CreatedMatchBody,
): NonNullable<CreatedMatchBody["snapshot"]> => {
  if (body.snapshot === undefined) {
    throw new Error("Match response did not include a snapshot.");
  }
  return body.snapshot;
};

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
            : {
                leader: { card_number: "OP13-079", count: 1 },
                main: [{ card_number: "OP13-082", count: 50 }],
                don: null,
              },
        ),
    },
  });

const createBotLobby = async (
  server: Awaited<ReturnType<typeof createDeckHashMatchHttpServer>>,
): Promise<CreatedCustomLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      settings: { formatId: "sandbox-open", botOpponent: true },
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()) as CreatedCustomLobbyBody;
};

const joinLobby = async (
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

const submitDeck = async (
  server: Awaited<ReturnType<typeof createDeckHashMatchHttpServer>>,
  lobbyId: string,
  sessionToken: string,
): Promise<CreatedCustomLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies/${lobbyId}/deck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-optcg-session-token": sessionToken,
    },
    body: JSON.stringify({ deckHash: "p1-hash", donDeckCount: 10 }),
  });
  assert.equal(response.status, 200);
  return (await response.json()) as CreatedCustomLobbyBody;
};

const claimSeat = async (
  server: Awaited<ReturnType<typeof createDeckHashMatchHttpServer>>,
  matchId: string,
  sessionToken: string,
): Promise<ClaimedMatchSeatBody> => {
  const response = await fetch(
    `${server.url()}/api/matches/${matchId}/seats/p1/claim`,
    {
      method: "POST",
      headers: { "x-optcg-session-token": sessionToken },
    },
  );
  assert.equal(response.status, 200);
  return (await response.json()) as ClaimedMatchSeatBody;
};

const chooseFirstPlayer = async (
  server: Awaited<ReturnType<typeof createDeckHashMatchHttpServer>>,
  matchId: string,
  chooserPlayerId: string,
  choice: "goFirst" | "goSecond" = "goFirst",
): Promise<CreatedMatchBody> => {
  const response = await fetch(
    `${server.url()}/api/matches/${matchId}/first-player-choice`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: chooserPlayerId, choice }),
    },
  );
  assert.equal(response.status, 200);
  return (await response.json()) as CreatedMatchBody;
};

describe("dev HTTP bot lobbies", () => {
  test("bot opponent lobby waits for the human first-player choice", async () => {
    const server = await createDeckHashMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createBotLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }
      assert.equal(created.settings?.botOpponent, true);
      assert.equal(requireLobbySeat(created, "p2").claimed, true);
      assert.equal(requireLobbySeat(created, "p2").deck.status, "ready");

      const sessionToken = "user:user-p1:session-1";
      const joined = await joinLobby(server, lobbyId, sessionToken);
      assert.equal(joined.seat?.playerId, "p1");

      const ready = await submitDeck(server, lobbyId, sessionToken);
      const matchId = ready.matchId;
      if (matchId === undefined) {
        throw new Error("Ready bot lobby response did not include a match id.");
      }
      assert.equal(requireLobbySeat(ready, "p1").deck.status, "ready");
      assert.equal(requireLobbySeat(ready, "p2").deck.status, "ready");

      const claim = await claimSeat(server, matchId, sessionToken);
      const chooser = claim.firstPlayerChoice?.chooserPlayerId;
      assert.deepEqual(claim.firstPlayerChoice?.choices, [
        "goFirst",
        "goSecond",
      ]);
      if (chooser === undefined) {
        throw new Error("Claim response did not include first-player setup.");
      }

      const resolved = await chooseFirstPlayer(server, matchId, chooser);
      const snapshot = requireSnapshot(resolved);

      assert.equal(snapshot.playerLabels?.["p2"]?.displayName, "Bot");
      assert.notEqual(snapshot.status, "completed");
      assert.notEqual(snapshot.status, "gameOver");
    } finally {
      await server.close();
    }
  });

  test("bot opponent lobby can start with the bot going first", async () => {
    const server = await createDeckHashMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createBotLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      const sessionToken = "user:user-p1:session-1";
      await joinLobby(server, lobbyId, sessionToken);
      const ready = await submitDeck(server, lobbyId, sessionToken);
      const matchId = ready.matchId;
      if (matchId === undefined) {
        throw new Error("Ready bot lobby response did not include a match id.");
      }

      const claim = await claimSeat(server, matchId, sessionToken);
      const chooser = claim.firstPlayerChoice?.chooserPlayerId;
      if (chooser === undefined) {
        throw new Error("Claim response did not include first-player setup.");
      }

      const resolved = await chooseFirstPlayer(
        server,
        matchId,
        chooser,
        "goSecond",
      );
      const snapshot = requireSnapshot(resolved);

      assert.equal(snapshot.playerLabels?.["p2"]?.displayName, "Bot");
      assert.notEqual(snapshot.status, "completed");
      assert.notEqual(snapshot.status, "gameOver");
    } finally {
      await server.close();
    }
  });
});
