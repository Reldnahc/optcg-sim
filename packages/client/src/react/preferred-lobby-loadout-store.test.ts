import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createMemoryClientStorage } from "../session.js";
import {
  loadPreferredLobbyLoadoutId,
  savePreferredLobbyLoadoutId,
} from "./preferred-lobby-loadout-store.js";

describe("preferred lobby loadout store", () => {
  test("round-trips the preferred lobby loadout id through persistent storage", () => {
    const storage = createMemoryClientStorage();

    assert.equal(loadPreferredLobbyLoadoutId(storage), undefined);
    savePreferredLobbyLoadoutId(storage, "loadout-2");

    assert.equal(loadPreferredLobbyLoadoutId(storage), "loadout-2");
  });

  test("drops malformed stored preferred lobby loadout ids", () => {
    const storage = createMemoryClientStorage();
    storage.setItem("optcg:client:preferred-lobby-loadout-id", "   ");

    assert.equal(loadPreferredLobbyLoadoutId(storage), undefined);
  });
});
