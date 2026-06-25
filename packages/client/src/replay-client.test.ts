import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createReplayClient } from "./replay-client.js";

describe("replay client", () => {
  test("lists replay summaries", async () => {
    const requests: string[] = [];
    const client = createReplayClient({
      baseUrl: "https://sim.example/",
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
              replays: [
                {
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
                },
              ],
            }),
          ),
        );
      },
    });

    const replays = await client.listReplays();

    assert.deepEqual(requests, ["https://sim.example/api/replays"]);
    assert.equal(replays.length, 1);
    assert.equal(replays[0]?.matchId, "match-1");
  });

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
                  replayFormatVersion: "dev-local-v1",
                  manifestSnapshot: { cards: {} },
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
    assert.deepEqual(replay.replay.manifestSnapshot, { cards: {} });
    assert.equal(replay.frameReconstruction, undefined);
  });

  test("loads replay frame chunks by match id", async () => {
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
              frameReconstruction: {
                status: "ready",
                frameCount: 5,
                start: 2,
                limit: 2,
                frames: [
                  {
                    index: 2,
                    actionIndex: 1,
                    label: "playCard",
                    snapshot: {
                      stateSeq: 3,
                      players: { p1: { view: {}, actions: [] } },
                    },
                  },
                ],
              },
            }),
          ),
        );
      },
    });

    const chunk = await client.getReplayFrames("match-1", {
      start: 2,
      limit: 2,
    });

    assert.deepEqual(requests, [
      "https://sim.example/api/replays/match-1/frames?start=2&limit=2",
    ]);
    assert.deepEqual(chunk, {
      status: "ready",
      frameCount: 5,
      start: 2,
      limit: 2,
      frames: [
        {
          index: 2,
          actionIndex: 1,
          label: "playCard",
          snapshot: {
            stateSeq: 3,
            players: { p1: { view: {}, actions: [] } },
          },
        },
      ],
    });
  });
});
