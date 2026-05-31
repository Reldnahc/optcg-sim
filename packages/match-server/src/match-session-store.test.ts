import { describe, expect, test } from "vitest";
import type { MatchId } from "@optcg/types";

import { createInMemoryMatchSessionStore } from "./match-session-store.js";

describe("in-memory match session store", () => {
  test("stores loads deletes and lists sessions by match id", () => {
    const store = createInMemoryMatchSessionStore<string>();

    store.set("match-1" as MatchId, "session");

    expect(store.get("match-1" as MatchId)).toBe("session");
    expect(store.listMatchIds()).toEqual(["match-1"]);
    store.delete("match-1" as MatchId);
    expect(store.get("match-1" as MatchId)).toBeUndefined();
  });
});
