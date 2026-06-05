import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
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
    folderId: "folder-1",
    folderName: "Ranked",
    favorite: true,
    leaderCardId: "OP05-098",
    leaderVariantIndex: 2,
    leaderImageUrl:
      "https://cdn.poneglyph.one/images/OP05-098/en/stock/2/full.png",
    updatedAt: "2026-06-02T00:00:00.000Z",
  },
  {
    id: "loadout-2",
    name: "Luffy Life",
    folderId: null,
    folderName: null,
    favorite: false,
    leaderCardId: "OP05-060",
    leaderVariantIndex: null,
    leaderImageUrl:
      "https://cdn.poneglyph.one/images/OP05-060/en/stock/0/full.png",
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

    assert.match(html, /Deck Loadout/u);
    assert.match(html, /modal-frame lobby-deck-modal/u);
    assert.doesNotMatch(html, />Close</u);
    assert.match(html, /deck-loadout-picker/u);
    assert.match(html, /Search deck loadouts/u);
    assert.match(html, /Ranked/u);
    assert.match(html, /Favorite/u);
    assert.match(html, /OP05-098 \/ Ranked/u);
    assert.match(
      html,
      /background-image:url\(&quot;https:\/\/cdn\.poneglyph\.one\/images\/OP05-098\/en\/stock\/2\/full\.png&quot;\)/u,
    );
    assert.match(html, /Enel Yellow/u);
    assert.match(html, /Unfiled/u);
    assert.match(html, /Luffy Life/u);
    assert.match(html, /Submit loadout/u);
    assert.doesNotMatch(html, /Account loadout/u);
    assert.doesNotMatch(html, /<select/u);
    assert.doesNotMatch(html, /<option/u);
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

  test("custom deck loadout picker scrolls internally inside a taller modal", async () => {
    const styles = await readFile(
      new URL("styles/controls.css", import.meta.url),
      "utf8",
    );

    assert.match(
      styles,
      /\.lobby-deck-modal\s*\{[^}]*height:\s*min\(720px,\s*calc\(100vh - 32px\)\);/u,
    );
    assert.match(styles, /\.lobby-deck-modal\s*\{[^}]*overflow:\s*hidden;/u);
    assert.match(
      styles,
      /\.deck-loadout-folder-list\s*\{[^}]*overflow:\s*auto;/u,
    );
    assert.match(styles, /\.deck-loadout-search\s*\{[^}]*resize:\s*none;/u);
    assert.match(
      styles,
      /\.deck-loadout-selected,\s*\.deck-loadout-option\s*\{[^}]*grid-template-columns:\s*112px minmax\(0,\s*1fr\);/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-selected,\s*\.deck-loadout-option\s*\{[^}]*padding:\s*0;/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-option\s*\{[^}]*grid-template-columns:\s*86px minmax\(0,\s*1fr\);/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-selected:hover:not\(:disabled\),\s*\.deck-loadout-option:hover:not\(:disabled\),\s*\.deck-loadout-option\.is-selected\s*\{[^}]*border-color:\s*rgba\(255,\s*255,\s*255,\s*0\.72\);/u,
    );
    assert.match(
      styles,
      /\.deck-hash-form button\s*\{[^}]*background:\s*#3f3d3c;/u,
    );
  });

  test("submit locks the selected deck loadout picker", async () => {
    const source = await readFile(
      new URL("LobbyDeckPanel.tsx", import.meta.url),
      "utf8",
    );

    assert.match(
      source,
      /const \[submittedLoadoutId,\s*setSubmittedLoadoutId\]/u,
    );
    assert.match(source, /setSubmittedLoadoutId\(selectedLoadoutId\);/u);
    assert.match(
      source,
      /const pickerLocked = submittedLoadoutId !== undefined;/u,
    );
    assert.match(source, /locked=\{pickerLocked\}/u);
    assert.match(
      source,
      /const canSubmit = selectedLoadoutExists && !disabled && !pickerLocked;/u,
    );
  });
});
