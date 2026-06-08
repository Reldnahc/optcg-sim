import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createMatchHttpServer } from "./match-http-server.js";
import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";

const createFixtureMatchHttpServer = async () =>
  createMatchHttpServer({
    setup: await createFixtureDevMatchSetup(),
    fetchCard: createDefaultDevFixtureFetch(),
  });

interface CreatedDevMatchBody {
  matchId?: string;
  snapshot?: { stateSeq?: number };
  firstPlayerChoice?: {
    chooserPlayerId?: string;
    choices?: string[];
    resolvedFirstPlayerId?: string;
  };
}

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

describe("dev first-player choice", () => {
  test("creates matches in first-player setup and resolves goFirst before engine boot", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createDevMatch(server);
      const matchId = created.matchId;
      const choice = created.firstPlayerChoice;
      if (matchId === undefined || choice?.chooserPlayerId === undefined) {
        throw new Error("Created match response did not include setup choice.");
      }
      assert.equal(created.snapshot, undefined);
      assert.deepEqual(choice.choices, ["goFirst", "goSecond"]);

      const resolved = await chooseFirstPlayer(
        server,
        matchId,
        choice.chooserPlayerId as "p1" | "p2",
        "goFirst",
      );

      assert.equal(
        resolved.firstPlayerChoice?.resolvedFirstPlayerId,
        choice.chooserPlayerId,
      );
      assert.equal(typeof resolved.snapshot?.stateSeq, "number");
    } finally {
      await server.close();
    }
  });

  test("rejects first-player setup responses from the non-chooser without booting the engine", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const created = await createDevMatch(server);
      const matchId = created.matchId;
      const chooser = created.firstPlayerChoice?.chooserPlayerId;
      if (matchId === undefined || (chooser !== "p1" && chooser !== "p2")) {
        throw new Error("Created match response did not include setup choice.");
      }
      const nonChooser = chooser === "p1" ? "p2" : "p1";

      const response = await fetch(
        `${server.url()}/api/matches/${matchId}/first-player-choice`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ playerId: nonChooser, choice: "goFirst" }),
        },
      );

      assert.equal(response.status, 403);
      const stateResponse = await fetch(
        `${server.url()}/api/matches/${matchId}/state`,
      );
      assert.equal(stateResponse.status, 409);
    } finally {
      await server.close();
    }
  });
});
