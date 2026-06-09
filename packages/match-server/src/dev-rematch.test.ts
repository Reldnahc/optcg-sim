import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { PlayerId } from "@optcg/types";
import type { DeckHashDeck } from "optcg-deck-hash";

import { requestHash } from "./action-envelope.js";
import { createMatchHttpServer } from "./match-http-server.js";
import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";

const createFixtureMatchHttpServer = async () =>
  createMatchHttpServer({
    setup: await createFixtureDevMatchSetup(),
    fetchCard: createDefaultDevFixtureFetch(),
    deckHashCodec: {
      decode: (hash): Promise<DeckHashDeck> =>
        Promise.resolve({
          leader: { card_number: "OP13-079", count: 1 },
          main: [
            {
              card_number: hash === "p1-rematch-hash" ? "OP13-080" : "OP13-082",
              count: 9,
            },
          ],
          don: null,
        }),
    },
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

interface TestDevPlayerAction {
  index?: number;
  type?: string;
}

interface TestDevStateBody {
  stateSeq?: number;
  players?: Record<
    string,
    {
      view?: { pendingDecision?: { playerId?: string } };
      actions?: TestDevPlayerAction[];
    }
  >;
}

interface TestSocket {
  socket: WebSocket;
  next: () => Promise<unknown>;
}

interface TestSessionTransitionBody {
  type?: string;
  matchId?: string;
  nextMatchId?: string;
  nextLobbyId?: string;
  firstPlayerChoice?: {
    chooserPlayerId?: string;
  };
}

interface CreatedCustomLobbyBody {
  lobbyId?: string;
  matchId?: string;
  seat?: { playerId?: string };
  seats?: Record<
    string,
    {
      playerId?: string;
      claimed?: boolean;
      deck: { status?: "missing" | "ready" | "invalid" };
    }
  >;
  errors?: string[];
}

const requireStateSeq = (
  snapshot: { stateSeq?: number } | undefined,
): number => {
  const stateSeq = snapshot?.stateSeq;
  if (stateSeq === undefined) {
    throw new Error("Expected snapshot stateSeq.");
  }
  return stateSeq;
};

const webSocketUrl = (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
  matchId: string,
  playerId: string,
  token: string,
): string => {
  const url = new URL(
    `/api/matches/${encodeURIComponent(matchId)}/ws`,
    server.url().replace(/^http/u, "ws"),
  );
  url.searchParams.set("playerId", playerId);
  url.searchParams.set("sessionToken", token);
  return url.toString();
};

const lobbyWebSocketUrl = (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
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

const nextSessionTransition = async (
  socket: TestSocket,
): Promise<TestSessionTransitionBody> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const message = (await socket.next()) as TestSessionTransitionBody;
    if (message.type === "sessionTransition") {
      return message;
    }
    if (message.type === "stateSync" || message.type === "heartbeat") {
      continue;
    }
    throw new Error(`Unexpected WebSocket message ${String(message.type)}.`);
  }
  throw new Error("Timed out waiting for session transition.");
};

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
  const body = (await response.json()) as CreatedDevMatchBody;
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
};

const createReadyDevMatch = async (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
): Promise<{ matchId: string }> => {
  const created = await createDevMatch(server);
  const matchId = created.matchId;
  const chooser = created.firstPlayerChoice?.chooserPlayerId;
  if (matchId === undefined || (chooser !== "p1" && chooser !== "p2")) {
    throw new Error("Created dev match response was missing setup choice.");
  }
  const ready = await chooseFirstPlayer(server, matchId, chooser, "goFirst");
  if (ready.snapshot?.stateSeq === undefined) {
    throw new Error("Ready dev match response was missing snapshot.");
  }
  return { matchId };
};

const claimDevSeat = async (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
  matchId: string,
  playerId: "p1" | "p2",
  sessionToken?: string,
): Promise<string> => {
  const actualSessionToken = sessionToken ?? `user:user-${playerId}:session-1`;
  const response = await fetch(
    `${server.url()}/api/matches/${matchId}/seats/${playerId}/claim`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-optcg-session-token": actualSessionToken,
      },
      body: JSON.stringify({}),
    },
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    seat?: { sessionToken?: string };
  };
  const token = body.seat?.sessionToken;
  if (token === undefined) {
    throw new Error("Claim seat response did not include a token.");
  }
  return token;
};

const createRematch = async (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
  matchId: string,
  playerId: "p1" | "p2",
  sessionToken: string,
): Promise<{
  status: number;
  body: CreatedDevMatchBody & CreatedCustomLobbyBody;
}> => {
  const response = await fetch(
    `${server.url()}/api/matches/${matchId}/rematch`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-optcg-session-token": sessionToken,
      },
      body: JSON.stringify({ playerId }),
    },
  );
  return {
    status: response.status,
    body: (await response.json()) as CreatedDevMatchBody,
  };
};

const submitCustomLobbyDeck = async (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
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

const nextStateSync = async (socket: TestSocket): Promise<TestDevStateBody> => {
  for (;;) {
    const message = (await socket.next()) as {
      type?: string;
      snapshot?: TestDevStateBody;
    };
    if (message.type === "stateSync" && message.snapshot !== undefined) {
      return message.snapshot;
    }
    if (message.type === "heartbeat" || message.type === "actionResult") {
      continue;
    }
    throw new Error(`Unexpected WebSocket message ${String(message.type)}.`);
  }
};

const concedeViaSocket = async (
  server: Awaited<ReturnType<typeof createFixtureMatchHttpServer>>,
  matchId: string,
  playerId: "p1" | "p2",
  sessionToken: string,
): Promise<{ p1Token: string; p2Token: string }> => {
  const p1Token =
    playerId === "p1"
      ? sessionToken
      : await claimDevSeat(server, matchId, "p1");
  const p2Token =
    playerId === "p2"
      ? sessionToken
      : await claimDevSeat(server, matchId, "p2");
  const sockets = {
    p1: await openSocket(webSocketUrl(server, matchId, "p1", p1Token)),
    p2: await openSocket(webSocketUrl(server, matchId, "p2", p2Token)),
  };
  let states = {
    p1: await nextStateSync(sockets.p1),
    p2: await nextStateSync(sockets.p2),
  };
  const submitAction = async (
    actingPlayerId: "p1" | "p2",
    actionIndex: number,
    expectedStateSeq: number,
  ): Promise<void> => {
    const clientActionId = `${actingPlayerId}-${String(actionIndex)}-${String(
      expectedStateSeq,
    )}`;
    sockets[actingPlayerId].socket.send(
      JSON.stringify({
        type: "submitAction",
        matchId,
        playerId: actingPlayerId,
        clientActionId,
        actionIndex,
        expectedStateSeq,
        requestHash: requestHash({
          type: "submitAction",
          playerId: actingPlayerId as PlayerId,
          actionIndex,
          expectedStateSeq,
        }),
      }),
    );
    for (;;) {
      const result = (await sockets[actingPlayerId].next()) as {
        type?: string;
        clientActionId?: string;
        accepted?: boolean;
      };
      if (
        result.type === "actionResult" &&
        result.clientActionId === clientActionId
      ) {
        assert.equal(result.accepted, true);
        return;
      }
    }
  };
  const submitAndRefreshState = async (
    actingPlayerId: "p1" | "p2",
    actionIndex: number,
    expectedStateSeq: number,
  ): Promise<void> => {
    await submitAction(actingPlayerId, actionIndex, expectedStateSeq);
    states = {
      p1: await nextStateSync(sockets.p1),
      p2: await nextStateSync(sockets.p2),
    };
  };
  try {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const state = states[playerId];
      const expectedStateSeq = requireStateSeq(state);
      const concedeAction = state.players?.[playerId]?.actions?.find(
        (action) => action.type === "concede",
      );
      if (concedeAction?.index !== undefined) {
        await submitAndRefreshState(
          playerId,
          concedeAction.index,
          expectedStateSeq,
        );
        return { p1Token, p2Token };
      }
      const pendingPlayerId =
        states.p1.players?.["p1"]?.view?.pendingDecision?.playerId ??
        states.p2.players?.["p2"]?.view?.pendingDecision?.playerId;
      if (pendingPlayerId !== "p1" && pendingPlayerId !== "p2") {
        throw new Error("Expected pending setup before concede action.");
      }
      const setupState = states[pendingPlayerId];
      const setupAction = setupState.players?.[pendingPlayerId]?.actions?.[0];
      if (setupAction?.index === undefined) {
        throw new Error("Expected visible setup action.");
      }
      await submitAndRefreshState(
        pendingPlayerId,
        setupAction.index,
        requireStateSeq(setupState),
      );
    }
    throw new Error("Timed out advancing setup to concession.");
  } finally {
    sockets.p1.socket.close();
    sockets.p2.socket.close();
  }
};

describe("dev rematches", () => {
  test("rejects rematch creation before the source match is completed", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const match = await createReadyDevMatch(server);
      const token = await claimDevSeat(server, match.matchId, "p1");

      const rematch = await createRematch(server, match.matchId, "p1", token);

      assert.equal(rematch.status, 409);
      assert.equal(rematch.body.snapshot, undefined);
    } finally {
      await server.close();
    }
  });

  test("creates rematch lobbies so both players can select decks again", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const match = await createReadyDevMatch(server);
      const loserToken = await claimDevSeat(server, match.matchId, "p1");
      const { p2Token } = await concedeViaSocket(
        server,
        match.matchId,
        "p1",
        loserToken,
      );

      const rematch = await createRematch(
        server,
        match.matchId,
        "p1",
        loserToken,
      );

      assert.equal(rematch.status, 201);
      const rematchLobbyId = rematch.body.lobbyId;
      if (rematchLobbyId === undefined) {
        throw new Error("Rematch response did not include lobby id.");
      }
      const rematchSeat = rematch.body.seat;
      const rematchSeats = rematch.body.seats;
      if (rematchSeat === undefined || rematchSeats === undefined) {
        throw new Error("Rematch response did not include lobby seats.");
      }
      const rematchP1Seat = rematchSeats["p1"];
      const rematchP2Seat = rematchSeats["p2"];
      if (rematchP1Seat === undefined || rematchP2Seat === undefined) {
        throw new Error("Rematch response did not include both player seats.");
      }
      assert.equal(rematch.body.matchId, undefined);
      assert.equal(rematch.body.snapshot, undefined);
      assert.equal(rematchSeat.playerId, "p1");
      assert.equal(rematchP1Seat.claimed, true);
      assert.equal(rematchP2Seat.claimed, true);
      assert.equal(rematchP1Seat.deck.status, "missing");
      assert.equal(rematchP2Seat.deck.status, "missing");

      await submitCustomLobbyDeck(
        server,
        rematchLobbyId,
        loserToken,
        "p1-rematch-hash",
      );
      const ready = await submitCustomLobbyDeck(
        server,
        rematchLobbyId,
        p2Token,
        "p2-rematch-hash",
      );
      const rematchId = ready.matchId;
      if (rematchId === undefined) {
        throw new Error(
          "Ready rematch lobby response did not include match id.",
        );
      }

      const resolved = await chooseFirstPlayer(
        server,
        rematchId,
        "p1",
        "goSecond",
      );

      assert.equal(resolved.firstPlayerChoice?.resolvedFirstPlayerId, "p2");
      assert.equal(typeof resolved.snapshot?.stateSeq, "number");
    } finally {
      await server.close();
    }
  });

  test("announces rematches on source sockets and resolves pending setup sockets", async () => {
    const server = await createFixtureMatchHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const match = await createReadyDevMatch(server);
      const loserToken = await claimDevSeat(server, match.matchId, "p1");
      const { p2Token } = await concedeViaSocket(
        server,
        match.matchId,
        "p1",
        loserToken,
      );
      const sourceP2 = await openSocket(
        webSocketUrl(server, match.matchId, "p2", p2Token),
      );
      await sourceP2.next();

      const rematch = await createRematch(
        server,
        match.matchId,
        "p1",
        loserToken,
      );

      assert.equal(rematch.status, 201);
      const rematchLobbyId = rematch.body.lobbyId;
      if (rematchLobbyId === undefined) {
        throw new Error("Rematch response did not include lobby id.");
      }
      const transition = await nextSessionTransition(sourceP2);
      assert.equal(transition.type, "sessionTransition");
      assert.equal(transition.matchId, match.matchId);
      assert.equal(transition.nextLobbyId, rematchLobbyId);
      assert.equal(transition.nextMatchId, undefined);

      const rematchLobbyP1 = await openSocket(
        lobbyWebSocketUrl(server, rematchLobbyId, "p1", loserToken),
      );
      await rematchLobbyP1.next();
      await submitCustomLobbyDeck(
        server,
        rematchLobbyId,
        loserToken,
        "p1-rematch-hash",
      );
      await rematchLobbyP1.next();
      const ready = await submitCustomLobbyDeck(
        server,
        rematchLobbyId,
        p2Token,
        "p2-rematch-hash",
      );
      const rematchId = ready.matchId;
      if (rematchId === undefined) {
        throw new Error(
          "Ready rematch lobby response did not include match id.",
        );
      }
      const lobbyReady = (await rematchLobbyP1.next()) as {
        type?: string;
        lobby?: CreatedCustomLobbyBody;
      };
      assert.equal(lobbyReady.type, "lobbySync");
      assert.equal(lobbyReady.lobby?.matchId, rematchId);

      const rematchP1Token = await claimDevSeat(
        server,
        rematchId,
        "p1",
        loserToken,
      );
      const rematchP2Token = await claimDevSeat(
        server,
        rematchId,
        "p2",
        p2Token,
      );
      const rematchP1 = await openSocket(
        webSocketUrl(server, rematchId, "p1", rematchP1Token),
      );
      const rematchP2 = await openSocket(
        webSocketUrl(server, rematchId, "p2", rematchP2Token),
      );
      const setupP1 = (await rematchP1.next()) as { type?: string };
      const setupP2 = (await rematchP2.next()) as { type?: string };
      assert.equal(setupP1.type, "setupSync");
      assert.equal(setupP2.type, "setupSync");

      await chooseFirstPlayer(server, rematchId, "p1", "goSecond");

      const p1State = (await rematchP1.next()) as { type?: string };
      const p2State = (await rematchP2.next()) as { type?: string };
      assert.equal(p1State.type, "stateSync");
      assert.equal(p2State.type, "stateSync");

      sourceP2.socket.close();
      rematchLobbyP1.socket.close();
      rematchP1.socket.close();
      rematchP2.socket.close();
    } finally {
      await server.close();
    }
  });
});
