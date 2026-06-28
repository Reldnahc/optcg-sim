import { strict as assert } from "node:assert";
import { test } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

import { createMatchClientController } from "./controller.js";
import {
  createClientSessionStore,
  createMemoryClientStorage,
} from "./session.js";
import {
  accountSessionToken,
  createFakeTransport,
} from "./controller-test-support.js";

test("match setup state keeps player labels when a ready lobby enters first-player choice", async () => {
  const transport = createFakeTransport();
  const controller = createMatchClientController({
    accountSessionToken,
    transport,
    sessionStore: createClientSessionStore({
      storage: createMemoryClientStorage(),
    }),
  });
  transport.submitLobbyDeck = (input) => {
    transport.submittedLobbyDecks.push(input);
    return Promise.resolve({
      lobbyId: input.lobbyId,
      matchId: "match-1" as MatchId,
      seats: {
        p1: {
          playerId: "p1" as PlayerId,
          claimed: true,
          displayName: "Alice",
          deck: { status: "ready" },
        },
        p2: {
          playerId: "p2" as PlayerId,
          claimed: true,
          displayName: "Bob",
          deck: { status: "ready" },
        },
      },
    });
  };
  transport.claimSeat = (input) => {
    transport.claimedSeats.push(input);
    return Promise.resolve({
      matchId: input.matchId,
      seat: {
        playerId: input.playerId,
        sessionToken: input.sessionToken ?? `token-${String(input.playerId)}`,
      },
      firstPlayerChoice: {
        chooserPlayerId: input.playerId,
        choices: ["goFirst", "goSecond"],
      },
      playerLabels: {
        [input.playerId]: { displayName: "Alice" },
        ["p2" as PlayerId]: { displayName: "Bob" },
      },
    });
  };

  await controller.joinCustomLobby({ lobbyId: "lobby-1" });
  const next = await controller.submitLobbyDeck({
    deckHash: "deck-hash",
    donDeckCount: 10,
  });

  assert.equal("firstPlayerChoice" in next, true);
  assert.deepEqual(
    "firstPlayerChoice" in next ? next.playerLabels : undefined,
    {
      p1: { displayName: "Alice" },
      p2: { displayName: "Bob" },
    },
  );
});
