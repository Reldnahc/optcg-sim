import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { MatchId, PlayerId } from "@optcg/types";

import {
  createClientSessionStore,
  createMemoryClientStorage,
} from "./session.js";

describe("client session store", () => {
  test("stores only the currently claimed seat credential", () => {
    const store = createClientSessionStore({
      storage: createMemoryClientStorage(),
    });
    const matchId = "match-1" as MatchId;

    store.saveClaimedSeat({
      matchId,
      playerId: "p1" as PlayerId,
      sessionToken: "token-p1",
    });
    store.saveClaimedSeat({
      matchId,
      playerId: "p2" as PlayerId,
      sessionToken: "token-p2",
    });

    assert.deepEqual(store.loadClaimedSeat(), {
      matchId,
      playerId: "p2",
      sessionToken: "token-p2",
    });
  });

  test("replacing match identity drops the previous credential", () => {
    const store = createClientSessionStore({
      storage: createMemoryClientStorage(),
    });

    store.saveClaimedSeat({
      matchId: "match-1" as MatchId,
      playerId: "p1" as PlayerId,
      sessionToken: "token-match-1",
    });
    store.setCurrentSeat({
      matchId: "match-2" as MatchId,
      playerId: "p1" as PlayerId,
    });

    assert.deepEqual(store.loadCurrentSeat(), {
      matchId: "match-2",
      playerId: "p1",
    });
    assert.equal(store.loadClaimedSeat(), undefined);
  });
});
