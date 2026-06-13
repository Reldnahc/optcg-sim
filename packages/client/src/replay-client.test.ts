import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createReplayClient } from "./replay-client.js";

describe("replay client", () => {
  test("loads public replay detail by match id", async () => {
    const requests: string[] = [];
    const client = createReplayClient({
      baseUrl: "https://sim.example",
      fetch: (input) => {
        requests.push(
          input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.toString()
              : input,
        );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              replay: {
                matchId: "match-1",
                status: "completed",
                gameType: "dev",
                formatId: "dev",
                lobbyId: "lobby-1",
                winnerUserId: null,
                winnerSeatId: "p1",
                startedAt: "2026-06-13T00:00:00.000Z",
                endedAt: "2026-06-13T00:10:00.000Z",
                turnCount: 4,
                actionCount: 2,
                players: [],
                replay: {
                  deterministicEntries: [{ type: "submitAction" }],
                  auditEntries: [],
                },
              },
            }),
          ),
        );
      },
    });

    const replay = await client.getReplay("match-1");

    assert.deepEqual(requests, ["https://sim.example/api/replays/match-1"]);
    assert.equal(replay.matchId, "match-1");
    assert.deepEqual(replay.replay.deterministicEntries, [
      { type: "submitAction" },
    ]);
  });
});
