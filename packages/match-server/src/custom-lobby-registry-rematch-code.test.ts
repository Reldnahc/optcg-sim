import { strict as assert } from "node:assert";
import { test } from "vitest";
import type { MatchId, PlayerId } from "@optcg/types";

import { createCustomLobbyRegistry } from "./custom-lobby-registry.js";
import type { AuthContext } from "./dev-auth.js";
import type { LocalDevMatchRegistry } from "./dev-local-match-registry.js";
import {
  createDefaultLobbySeats,
  createMemoryLobbyStore,
} from "./lobby-store.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const sourceMatchId = "match-source" as MatchId;

const auth = (userId: string, sessionId: string): AuthContext => ({
  subject: { type: "user", userId, sessionId },
});

const createFakeMatchRegistry = (
  botPlayerIds: readonly PlayerId[] = [],
): LocalDevMatchRegistry =>
  ({
    defaultMatchId: "match-default" as MatchId,
    getMatch() {
      return undefined;
    },
    virtualConnectedPlayerIds() {
      return new Set(botPlayerIds);
    },
    getFirstPlayerChoice() {
      return undefined;
    },
    createRematchSeed() {
      return {
        firstPlayerChoice: {
          chooserPlayerId: p1,
          choices: ["goFirst", "goSecond"],
        },
        playerOrder: [p1, p2],
        botPlayerIds,
        seats: {
          p1: {
            playerId: p1,
            subject: auth("user-1", "session-1").subject,
          },
          p2: {
            playerId: p2,
            subject: auth("user-2", "session-1").subject,
          },
        },
      };
    },
  }) as unknown as LocalDevMatchRegistry;

test("rematch lobbies reuse the source lobby code and repoint the alias", async () => {
  const lobbyStore = createMemoryLobbyStore();
  const joinCode = await lobbyStore.createLobbyJoinCode("lobby-source");
  await lobbyStore.createLobby({
    lobbyId: "lobby-source",
    joinCode,
    settings: { formatId: "sandbox-open" },
    seats: createDefaultLobbySeats(),
    matchId: sourceMatchId,
  });
  await lobbyStore.setLobbyMatchId("lobby-source", sourceMatchId);
  const registry = await createCustomLobbyRegistry(createFakeMatchRegistry(), {
    lobbyStore,
  });

  const pending = await registry.createRematchLobby(
    sourceMatchId,
    p1,
    auth("user-1", "session-1"),
  );
  const rematch = await registry.createRematchLobby(
    sourceMatchId,
    p2,
    auth("user-2", "session-1"),
  );
  if (typeof rematch === "string" || "rematch" in rematch) {
    throw new Error("Expected rematch lobby response.");
  }

  assert.deepEqual(pending, { rematch: { status: "pending" } });
  assert.notEqual(rematch.lobbyId, "lobby-source");
  assert.equal(rematch.joinCode, joinCode);
  assert.equal(
    await lobbyStore.getLobbyIdByJoinCode(joinCode),
    rematch.lobbyId,
  );
});

test("bot rematches count the bot as already accepted", async () => {
  const lobbyStore = createMemoryLobbyStore();
  const joinCode = await lobbyStore.createLobbyJoinCode("lobby-source");
  await lobbyStore.createLobby({
    lobbyId: "lobby-source",
    joinCode,
    settings: { formatId: "sandbox-open", botOpponent: true },
    seats: createDefaultLobbySeats(),
    matchId: sourceMatchId,
  });
  await lobbyStore.setLobbyMatchId("lobby-source", sourceMatchId);
  const registry = await createCustomLobbyRegistry(
    createFakeMatchRegistry([p2]),
    { lobbyStore },
  );

  const rematch = await registry.createRematchLobby(
    sourceMatchId,
    p1,
    auth("user-1", "session-1"),
  );
  if (typeof rematch === "string" || "rematch" in rematch) {
    throw new Error("Expected bot rematch lobby response.");
  }

  assert.notEqual(rematch.lobbyId, "lobby-source");
  assert.equal(rematch.joinCode, joinCode);
  assert.equal(rematch.settings.botOpponent, true);
  assert.equal(rematch.seat?.playerId, p1);
});

test("lobby responses do not expose match ids unavailable to the local registry", async () => {
  const lobbyStore = createMemoryLobbyStore();
  const unavailableMatchId = "match-unavailable" as MatchId;
  await lobbyStore.createLobby({
    lobbyId: "lobby-with-stale-match",
    settings: { formatId: "sandbox-open" },
    seats: createDefaultLobbySeats(),
    matchId: unavailableMatchId,
  });
  const registry = await createCustomLobbyRegistry(createFakeMatchRegistry(), {
    lobbyStore,
  });

  const lobby = await registry.getLobby("lobby-with-stale-match");

  assert.equal(lobby?.matchId, undefined);
});
