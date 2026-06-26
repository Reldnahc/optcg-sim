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
  test("creates and joins primitive lobbies without caller-selected seats", async () => {
    const recorder = createRecordingFetch((request) =>
      responseJson({
        lobbyId: "lobby-1",
        settings: { formatId: "sandbox-open" },
        seat: { playerId: "p1" },
        seats: {
          p1: {
            playerId: "p1",
            claimed: true,
            deck: { status: "missing" },
          },
          p2: {
            playerId: "p2",
            claimed: false,
            deck: { status: "missing" },
          },
        },
        ...(request.url.endsWith("/join") ? { matchId: "match-1" } : {}),
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000/",
      fetch: recorder.fetch,
    });

    await transport.createLobby({ settings: { formatId: "Standard" } });
    const joined = await transport.joinLobby({
      lobbyId: "lobby-1",
      sessionToken: "user:user-1:session-1",
    });
    await transport.loadLobby("lobby-1");

    assert.equal(joined.matchId, "match-1");
    assert.deepEqual(joined.seat, { playerId: "p1" });
    assert.deepEqual(
      recorder.requests.map((request) => request.url),
      [
        "http://localhost:3000/api/lobbies",
        "http://localhost:3000/api/lobbies/lobby-1/join",
        "http://localhost:3000/api/lobbies/lobby-1",
      ],
    );
    assert.equal(
      recorder.requests[0]?.init?.body,
      JSON.stringify({ settings: { formatId: "Standard" } }),
    );
    assert.equal(
      new Headers(recorder.requests[1]?.init?.headers).get(
        "x-optcg-session-token",
      ),
      "user:user-1:session-1",
    );
  });

  test("sends disabled timer lobby settings when creating a lobby", async () => {
    const recorder = createRecordingFetch(() =>
      responseJson({
        lobbyId: "lobby-1",
        settings: { formatId: "Standard", timerDisabled: true },
        seats: {},
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000/",
      fetch: recorder.fetch,
    });

    await transport.createLobby({
      settings: { formatId: "Standard", timerDisabled: true },
    });

    assert.equal(
      recorder.requests[0]?.init?.body,
      JSON.stringify({
        settings: { formatId: "Standard", timerDisabled: true },
      }),
    );
  });

  test("sends passive bot lobby settings when creating a lobby", async () => {
    const recorder = createRecordingFetch(() =>
      responseJson({
        lobbyId: "lobby-1",
        settings: {
          formatId: "Standard",
          botOpponent: true,
          botBehavior: "passive",
        },
        seats: {},
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000/",
      fetch: recorder.fetch,
    });

    await transport.createLobby({
      settings: {
        formatId: "Standard",
        botOpponent: true,
        botBehavior: "passive",
      },
    });

    assert.equal(
      recorder.requests[0]?.init?.body,
      JSON.stringify({
        settings: {
          formatId: "Standard",
          botOpponent: true,
          botBehavior: "passive",
        },
      }),
    );
  });

  test("joins primitive lobbies by reusable short join code", async () => {
    const recorder = createRecordingFetch(() =>
      responseJson({
        lobbyId: "lobby-1",
        joinCode: "ab12",
        settings: { formatId: "sandbox-open" },
        seat: { playerId: "p1" },
        seats: {
          p1: {
            playerId: "p1",
            claimed: true,
            deck: { status: "missing" },
          },
          p2: {
            playerId: "p2",
            claimed: false,
            deck: { status: "missing" },
          },
        },
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000/",
      fetch: recorder.fetch,
    });

    const joined = await transport.joinLobbyByCode({
      joinCode: "ab12",
      sessionToken: "user:user-1:session-1",
    });

    const request = recorder.requests[0];
    if (request === undefined) {
      throw new Error("Expected a join-by-code request.");
    }
    assert.equal(joined.lobbyId, "lobby-1");
    assert.equal(joined.joinCode, "ab12");
    assert.equal(
      request.url,
      "http://localhost:3000/api/lobbies/by-code/ab12/join",
    );
    assert.equal(
      new Headers(request.init?.headers).get("x-optcg-session-token"),
      "user:user-1:session-1",
    );
  });

  test("submits lobby deck hashes with the account session token", async () => {
    const recorder = createRecordingFetch(() =>
      responseJson({
        lobbyId: "lobby-1",
        settings: { formatId: "sandbox-open" },
        seats: {
          p1: {
            playerId: "p1",
            claimed: true,
            deck: { status: "ready" },
          },
          p2: {
            playerId: "p2",
            claimed: false,
            deck: { status: "missing" },
          },
        },
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000/",
      fetch: recorder.fetch,
    });

    await transport.submitLobbyDeck({
      lobbyId: "lobby-1",
      sessionToken: "user:user-1:session-1",
      deckHash: "hash-a",
      donDeckCount: 6,
    });

    const request = recorder.requests[0];
    if (request === undefined) {
      throw new Error("Expected a deck submission request.");
    }
    if (request.init === undefined) {
      throw new Error("Expected deck submission request init.");
    }
    assert.equal(request.url, "http://localhost:3000/api/lobbies/lobby-1/deck");
    assert.equal(
      request.init.body,
      JSON.stringify({ deckHash: "hash-a", donDeckCount: 6 }),
    );
    assert.equal(
      new Headers(request.init.headers).get("x-optcg-session-token"),
      "user:user-1:session-1",
    );
  });

  test("submits account loadout handoff tokens without resolved deck payloads", async () => {
    const recorder = createRecordingFetch(() =>
      responseJson({
        lobbyId: "lobby-1",
        settings: { formatId: "sandbox-open" },
        seat: { playerId: "p1", sessionToken: "user:u:s" },
        seats: {
          p1: {
            playerId: "p1",
            claimed: true,
            deck: { status: "ready" },
          },
          p2: {
            playerId: "p2",
            claimed: false,
            deck: { status: "missing" },
          },
        },
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000/",
      fetch: recorder.fetch,
    });

    const lobby = await transport.submitLobbyLoadoutHandoff({
      lobbyId: "lobby-1",
      handoffToken: "handoff-token",
    });

    const request = recorder.requests[0];
    if (request === undefined || request.init === undefined) {
      throw new Error("Expected a loadout handoff request.");
    }
    assert.equal(
      request.url,
      "http://localhost:3000/api/lobbies/lobby-1/loadout",
    );
    assert.equal(
      request.init.body,
      JSON.stringify({ handoffToken: "handoff-token" }),
    );
    assert.equal(
      JSON.stringify(request.init.body).includes("resolved_loadout"),
      false,
    );
    assert.deepEqual(lobby.seat, {
      playerId: "p1" as PlayerId,
      sessionToken: "user:u:s",
    });
  });

  test("validates lobby loadout handoff tokens without resolved deck payloads", async () => {
    const recorder = createRecordingFetch(() =>
      responseJson({
        data: {
          loadouts: [
            {
              loadoutId: "loadout-1",
              status: "playable",
              errors: [],
            },
            {
              loadoutId: "loadout-2",
              status: "unplayable",
              errors: ["Resolved loadout is invalid."],
            },
          ],
        },
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000/",
      fetch: recorder.fetch,
    });

    const result = await transport.validateLobbyLoadouts({
      lobbyId: "lobby-1",
      handoffTokens: ["token-1", "token-2"],
    });

    const request = recorder.requests[0];
    if (request === undefined || request.init === undefined) {
      throw new Error("Expected a loadout validation request.");
    }
    assert.equal(
      request.url,
      "http://localhost:3000/api/lobbies/lobby-1/loadouts/validate",
    );
    assert.equal(
      request.init.body,
      JSON.stringify({ handoffTokens: ["token-1", "token-2"] }),
    );
    assert.equal(
      JSON.stringify(request.init.body).includes("resolved_loadout"),
      false,
    );
    assert.deepEqual(result.data.loadouts[1], {
      loadoutId: "loadout-2",
      status: "unplayable",
      errors: ["Resolved loadout is invalid."],
    });
  });

  test("validates lobby deck hashes for preflight without handoff tokens", async () => {
    const recorder = createRecordingFetch(() =>
      responseJson({
        data: {
          loadouts: [
            {
              loadoutId: "loadout-1",
              status: "playable",
              errors: [],
            },
          ],
        },
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000/",
      fetch: recorder.fetch,
    });

    const result = await transport.validateLobbyDecks({
      lobbyId: "lobby-1",
      decks: [
        {
          loadoutId: "loadout-1",
          deckHash: "deck-hash-1",
          donDeckCount: 10,
        },
      ],
    });

    const request = recorder.requests[0];
    if (request === undefined || request.init === undefined) {
      throw new Error("Expected a deck validation request.");
    }
    assert.equal(
      request.url,
      "http://localhost:3000/api/lobbies/lobby-1/decks/validate",
    );
    assert.equal(
      request.init.body,
      JSON.stringify({
        decks: [
          {
            loadoutId: "loadout-1",
            deckHash: "deck-hash-1",
            donDeckCount: 10,
          },
        ],
      }),
    );
    assert.equal(JSON.stringify(request.init.body).includes("handoff"), false);
    assert.deepEqual(result.data.loadouts[0], {
      loadoutId: "loadout-1",
      status: "playable",
      errors: [],
    });
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

  test("sends an existing seat token when reclaiming a seat", async () => {
    const recorder = createRecordingFetch(() =>
      responseJson({
        matchId: "match-1",
        seat: { playerId: "p1", sessionToken: "token-p1" },
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000/",
      fetch: recorder.fetch,
    });

    await transport.claimSeat({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      sessionToken: "token-p1",
    });

    const request = recorder.requests[0];
    if (request === undefined) {
      throw new Error("Expected a claim request to be recorded.");
    }
    assert.equal(
      new Headers(request.init?.headers).get("x-optcg-session-token"),
      "token-p1",
    );
  });

  test("claims the current account seat without a browser-selected player id", async () => {
    const recorder = createRecordingFetch(() =>
      responseJson({
        matchId: "match-1",
        seat: { playerId: "p1", sessionToken: "account-token" },
      }),
    );
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000/",
      fetch: recorder.fetch,
    });

    const claimed = await transport.claimSeatForAccount({
      matchId: "match-1" as MatchId,
      sessionToken: "account-token",
    });

    assert.deepEqual(claimed.seat, {
      playerId: "p1",
      sessionToken: "account-token",
    });
    const request = recorder.requests[0];
    if (request === undefined) {
      throw new Error("Expected an account seat claim request.");
    }
    assert.equal(
      request.url,
      "http://localhost:3000/api/matches/match-1/seat/claim",
    );
    assert.equal(
      new Headers(request.init?.headers).get("x-optcg-session-token"),
      "account-token",
    );
  });

  test("does not expose HTTP gameplay action helpers", () => {
    const transport = createDevHttpMatchTransport({
      baseUrl: "http://localhost:3000",
      fetch: createRecordingFetch(() => responseJson({})).fetch,
    });

    assert.equal("submitVisibleAction" in transport, false);
    assert.equal("respondToDecision" in transport, false);
  });
});
