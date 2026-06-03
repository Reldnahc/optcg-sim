import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";
import type { PlayerId } from "@optcg/types";

import type { LobbyClientState } from "../controller.js";
import type { AccountLoadout } from "../account-client.js";
import { LobbyDeckPanel } from "./LobbyDeckPanel.js";

const lobbyState = (): LobbyClientState => ({
  lobbyId: "lobby-1",
  seat: {
    lobbyId: "lobby-1",
    playerId: "p1" as PlayerId,
    sessionToken: "session-token",
  },
  lobby: {
    lobbyId: "lobby-1",
    seats: {
      p1: {
        playerId: "p1" as PlayerId,
        claimed: true,
        deck: { status: "missing" },
      },
      p2: {
        playerId: "p2" as PlayerId,
        claimed: false,
        deck: { status: "missing" },
      },
    },
  },
});

const loadouts: readonly AccountLoadout[] = [
  {
    id: "loadout-1",
    name: "Enel Yellow",
    mainDeckId: "deck-1",
    donDeckId: "don-1",
    updatedAt: "2026-06-02T00:00:00.000Z",
  },
  {
    id: "loadout-2",
    name: "Luffy Life",
    mainDeckId: "deck-2",
    donDeckId: null,
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
];

describe("lobby deck panel", () => {
  test("selects account loadouts instead of accepting deck hashes", () => {
    const html = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState(),
        loadouts,
        loadoutsStatus: "ready",
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.match(html, /Account loadout/u);
    assert.match(html, /Enel Yellow/u);
    assert.match(html, /Luffy Life/u);
    assert.match(html, /Submit loadout/u);
    assert.doesNotMatch(html, /Deck hash/u);
    assert.doesNotMatch(html, /DON deck size/u);
    assert.doesNotMatch(html, /textarea/u);
  });

  test("shows account auth failures without exposing a manual deck fallback", () => {
    const html = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState(),
        loadouts: [],
        loadoutsStatus: "error",
        loadoutsError: "Sign in to Poneglyph to choose a loadout.",
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.match(html, /Sign in to Poneglyph/u);
    assert.doesNotMatch(html, /Deck hash/u);
    assert.doesNotMatch(html, /textarea/u);
  });
});
