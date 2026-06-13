import { strict as assert } from "node:assert";
import { test } from "vitest";
import type { PlayerId } from "@optcg/types";

import { createMatchHttpServer } from "./match-http-server.js";
import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";

interface CreatedCustomLobbyBody {
  lobbyId?: string;
  joinCode?: string;
  seat?: { playerId?: string };
  seats: Record<
    string,
    {
      playerId?: string;
      claimed?: boolean;
      deck: { status: "missing" | "ready" | "invalid" };
    }
  >;
}

const createFixtureMatchHttpServer = async () =>
  createMatchHttpServer({
    setup: await createFixtureDevMatchSetup(),
    fetchCard: createDefaultDevFixtureFetch(),
  });

const createCustomLobby = async (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
): Promise<CreatedCustomLobbyBody> => {
  const response = await fetch(`${server.url()}/api/lobbies`, {
    method: "POST",
  });
  assert.equal(response.status, 201);
  return (await response.json()) as CreatedCustomLobbyBody;
};

test("created lobbies expose a short join code that can join by alias", async () => {
  const server = await createFixtureMatchHttpServer();
  await server.listen(0, "127.0.0.1");
  try {
    const created = await createCustomLobby(server);
    const joinCode = created.joinCode;
    assert.equal(typeof joinCode, "string");
    assert.match(joinCode ?? "", /^[0-9a-z]{4}$/u);

    const response = await fetch(
      `${server.url()}/api/lobbies/by-code/${String(joinCode).toUpperCase()}/join`,
      {
        method: "POST",
        headers: { "x-optcg-session-token": "user:user-a:session-1" },
      },
    );

    assert.equal(response.status, 200);
    const joined = (await response.json()) as CreatedCustomLobbyBody;
    assert.equal(joined.lobbyId, created.lobbyId);
    assert.equal(joined.joinCode, joinCode);
    assert.equal(joined.seat?.playerId, "p1" as PlayerId);
  } finally {
    await server.close();
  }
});
