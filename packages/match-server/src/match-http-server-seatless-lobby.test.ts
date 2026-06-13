import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createDefaultDevFixtureFetch } from "./default-dev-fixture-fetch.test-support.js";
import { createMatchHttpServer } from "./match-http-server.js";

const createFixtureMatchHttpServer = async () =>
  createMatchHttpServer({
    fetchCard: createDefaultDevFixtureFetch(),
  });

interface CreatedCustomLobbyBody {
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
  lobby: CreatedCustomLobbyBody,
  seatId: string,
): CreatedCustomLobbyBody["seats"][string] => {
  const seat = lobby.seats[seatId];
  if (seat === undefined) {
    throw new Error(`Lobby response was missing ${seatId}.`);
  }
  return seat;
};

const createCustomLobby = async (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
): Promise<CreatedCustomLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies`, {
    method: "POST",
  });
  assert.equal(response.status, 201);
  return (await response.json()) as CreatedCustomLobbyBody;
};

const joinCustomLobby = async (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
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

describe("match HTTP server seatless lobbies", () => {
  test("seatless lobby join assigns first open seat by account session", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      const first = await joinCustomLobby(
        server,
        lobbyId,
        "user:user-a:session-1",
      );
      const second = await joinCustomLobby(
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

  test("seatless lobby join is idempotent for the same account across sessions", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      const first = await joinCustomLobby(
        server,
        lobbyId,
        "user:user-a:session-1",
      );
      const second = await joinCustomLobby(
        server,
        lobbyId,
        "user:user-a:session-2",
      );

      assert.equal(first.seat?.playerId, "p1");
      assert.equal(second.seat?.playerId, "p1");
      assert.equal(second.matchId, undefined);
    } finally {
      await server.close();
    }
  });

  test("seatless lobby join fails closed when the lobby is full", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      await joinCustomLobby(server, lobbyId, "user:user-a:session-1");
      await joinCustomLobby(server, lobbyId, "user:user-b:session-1");
      const response = await fetch(
        `${server.url()}/api/lobbies/${lobbyId}/join`,
        {
          method: "POST",
          headers: { "x-optcg-session-token": "user:user-c:session-1" },
        },
      );
      const body = (await response.json()) as CreatedCustomLobbyBody;

      assert.equal(response.status, 409);
      assert.deepEqual(body.errors, ["Lobby is full."]);
    } finally {
      await server.close();
    }
  });

  test("lobby join responses do not expose account session tokens", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createCustomLobby(server);
      const lobbyId = created.lobbyId;
      if (lobbyId === undefined) {
        throw new Error("Created lobby response did not include a lobby id.");
      }

      const joined = await joinCustomLobby(
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
});
