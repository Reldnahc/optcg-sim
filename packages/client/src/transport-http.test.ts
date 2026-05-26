import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

import { createDevHttpMatchTransport } from "./transport-http.js";

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

const responseJson = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const createRecordingFetch = (
  handler: (request: RecordedRequest) => Response,
): {
  fetch: typeof fetch;
  requests: RecordedRequest[];
} => {
  const requests: RecordedRequest[] = [];
  return {
    requests,
    fetch: (input, init) => {
      const request = {
        url: input instanceof Request ? input.url : String(input),
        ...(init === undefined ? {} : { init }),
      };
      requests.push(request);
      return Promise.resolve(handler(request));
    },
  };
};

describe("dev HTTP match transport", () => {
  test("creates and claims primitive lobbies", async () => {
    const recorder = createRecordingFetch((request) =>
      responseJson({
        lobbyId: "lobby-1",
        seats: {
          p1: { playerId: "p1", claimed: true },
          p2: { playerId: "p2", claimed: false },
        },
        ...(request.url.endsWith("/claim") ? { matchId: "match-1" } : {}),
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000/",
      fetch: recorder.fetch,
    });

    await transport.createLobby();
    const claimed = await transport.claimLobbySeat({
      lobbyId: "lobby-1",
      playerId: "p1" as PlayerId,
    });
    await transport.loadLobby("lobby-1");

    assert.equal(claimed.matchId, "match-1");
    assert.deepEqual(
      recorder.requests.map((request) => request.url),
      [
        "http://localhost:3000/api/lobbies",
        "http://localhost:3000/api/lobbies/lobby-1/seats/p1/claim",
        "http://localhost:3000/api/lobbies/lobby-1",
      ],
    );
  });

  test("creates a match without accepting bulk seat tokens", async () => {
    const recorder = createRecordingFetch(() =>
      responseJson({
        matchId: "match-1",
        seats: {
          p1: { playerId: "p1", claimed: false },
          p2: { playerId: "p2", claimed: false },
        },
        snapshot: { stateSeq: 1 },
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000",
      fetch: recorder.fetch,
    });

    const created = await transport.createMatch();

    assert.equal(created.matchId, "match-1");
    assert.equal(JSON.stringify(created).includes("sessionToken"), false);
    assert.equal(
      recorder.requests[0]?.url,
      "http://localhost:3000/api/matches",
    );
  });

  test("claims exactly one seat", async () => {
    const recorder = createRecordingFetch(() =>
      responseJson({
        matchId: "match-1",
        seat: { playerId: "p2", sessionToken: "token-p2" },
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000/",
      fetch: recorder.fetch,
    });

    const claimed = await transport.claimSeat({
      matchId: "match-1" as MatchId,
      playerId: "p2" as PlayerId,
    });

    assert.deepEqual(claimed.seat, {
      playerId: "p2",
      sessionToken: "token-p2",
    });
    assert.equal(
      recorder.requests[0]?.url,
      "http://localhost:3000/api/matches/match-1/seats/p2/claim",
    );
  });

  test("sends the claimed seat token with action requests", async () => {
    const recorder = createRecordingFetch(() =>
      responseJson({
        snapshot: { stateSeq: 2 },
        errors: [],
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000",
      fetch: recorder.fetch,
    });

    await transport.submitVisibleAction({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      sessionToken: "token-p1",
      actionIndex: 3,
      expectedStateSeq: 1,
    });

    const request = recorder.requests[0];
    if (request === undefined) {
      throw new Error("Expected an action request to be recorded.");
    }
    assert.equal(
      new Headers(request.init?.headers).get("x-optcg-session-token"),
      "token-p1",
    );
    assert.equal(request.init?.method, "POST");
    assert.equal(
      request.init.body,
      JSON.stringify({
        playerId: "p1",
        actionIndex: 3,
        expectedStateSeq: 1,
      }),
    );
  });
});
