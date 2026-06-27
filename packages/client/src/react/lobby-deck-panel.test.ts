import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";
import type { PlayerId } from "@optcg/types";

import type { LobbyClientState } from "../controller.js";
import type { AccountLoadout } from "../account-client.js";
import { DeckLoadoutPicker } from "./DeckLoadoutPicker.js";
import { LobbyDeckPanel } from "./LobbyDeckPanel.js";

const lobbyState = ({
  selfDeckStatus = "missing",
}: {
  readonly selfDeckStatus?: "missing" | "ready" | "invalid";
} = {}): LobbyClientState => ({
  lobbyId: "lobby-1",
  seat: {
    lobbyId: "lobby-1",
    playerId: "p1" as PlayerId,
    sessionToken: "session-token",
  },
  lobby: {
    lobbyId: "lobby-1",
    settings: { formatId: "sandbox-open" },
    seats: {
      p1: {
        playerId: "p1" as PlayerId,
        claimed: true,
        deck: { status: selfDeckStatus },
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
    deckHash: "enel-yellow-hash",
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
    deckHash: "luffy-life-hash",
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

const validatedLoadouts: readonly AccountLoadout[] = loadouts.map(
  (loadout, index) => ({
    ...loadout,
    validation:
      index === 0
        ? { status: "playable", errors: [] }
        : {
            status: "unplayable",
            errors: ["Resolved loadout is invalid."],
          },
  }),
);

describe("lobby deck panel", () => {
  test("selects account loadouts instead of accepting deck hashes", () => {
    const html = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState(),
        loadouts,
        loadoutsStatus: "ready",
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.match(html, /modal-frame lobby-deck-modal/u);
    assert.doesNotMatch(html, /modal-frame-header/u);
    assert.doesNotMatch(html, />Close</u);
    assert.match(html, /deck-loadout-picker/u);
    assert.match(html, /Search deck loadouts/u);
    assert.match(html, /Favorites/u);
    assert.match(html, /Ranked/u);
    assert.match(html, /Favorite/u);
    assert.equal(html.match(/Enel Yellow/gu)?.length ?? 0, 3);
    assert.match(html, /OP05-098 \/ Ranked/u);
    assert.match(
      html,
      /background-image:url\(&quot;https:\/\/cdn\.poneglyph\.one\/images\/OP05-098\/en\/stock\/2\/full\.png&quot;\)/u,
    );
    assert.match(html, /Enel Yellow/u);
    assert.match(html, /Unfiled/u);
    assert.match(html, /Luffy Life/u);
    assert.match(
      html,
      /class="deck-loadout-submit-button modal-submit-button"/u,
    );
    assert.match(html, />Submit</u);
    assert.doesNotMatch(html, /deck-status-list/u);
    assert.doesNotMatch(html, /Your deck/u);
    assert.doesNotMatch(html, /Opponent deck/u);
    assert.doesNotMatch(html, /Deck Loadout/u);
    assert.doesNotMatch(html, /Account loadout/u);
    assert.doesNotMatch(html, /<select/u);
    assert.doesNotMatch(html, /<option/u);
    assert.doesNotMatch(html, /Deck hash/u);
    assert.doesNotMatch(html, /DON deck size/u);
    assert.doesNotMatch(html, /textarea/u);
  });

  test("prefers the last submitted loadout by id instead of list position", () => {
    const html = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState(),
        loadouts,
        loadoutsStatus: "ready",
        preferredLoadoutId: "loadout-2",
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.match(
      html,
      /deck-loadout-option is-selected[\s\S]*Luffy Life/u,
    );
    assert.doesNotMatch(
      html,
      /deck-loadout-option is-selected[\s\S]*Enel Yellow/u,
    );
  });

  test("shows account auth failures without exposing a manual deck fallback", () => {
    const html = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState(),
        loadouts: [],
        loadoutsStatus: "error",
        loadoutsError: "Sign in to Poneglyph to choose a loadout.",
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.match(html, /Sign in to Poneglyph/u);
    assert.doesNotMatch(html, /Deck hash/u);
    assert.doesNotMatch(html, /textarea/u);
  });

  test("links to the external deck editor in a new tab", () => {
    const html = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState(),
        loadouts,
        loadoutsStatus: "ready",
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.match(
      html,
      /<a class="deck-editor-link" href="https:\/\/poneglyph\.one\/decks" target="_blank" rel="noreferrer">Open deck editor<\/a>/u,
    );
  });

  test("renders a refresh decks button beside the deck editor link", () => {
    const html = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState(),
        loadouts,
        loadoutsStatus: "ready",
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.match(html, /<div class="deck-loadout-actions">/u);
    assert.match(
      html,
      /<button class="deck-loadout-refresh-button" type="button">Refresh decks<\/button>/u,
    );
  });

  test("marks explicit illegal loadouts unselectable without a hide illegal toggle", () => {
    const html = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState(),
        loadouts: validatedLoadouts,
        loadoutsStatus: "ready",
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.doesNotMatch(html, /Hide illegal decks/u);
    assert.match(html, /Resolved loadout is invalid\./u);
    assert.match(html, /deck-loadout-option[^>]*disabled=""[\s\S]*Luffy Life/u);
  });

  test("allows unchecked local loadouts when validation is not required", () => {
    const uncheckedLoadouts: readonly AccountLoadout[] = loadouts.map(
      (loadout) => ({
        ...loadout,
        validation: { status: "unchecked", errors: [] },
      }),
    );
    const html = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState(),
        loadouts: uncheckedLoadouts,
        loadoutsStatus: "ready",
        requirePlayableValidation: false,
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.doesNotMatch(html, /Hide illegal decks/u);
    assert.doesNotMatch(
      html,
      /deck-loadout-option[^>]*disabled=""[\s\S]*Enel Yellow/u,
    );
    assert.doesNotMatch(
      html,
      /<button class="deck-loadout-submit-button modal-submit-button" type="submit" disabled="">Submit/u,
    );
  });

  test("allows submitting unchecked loadouts so the selected deck validates once", () => {
    const uncheckedLoadouts: readonly AccountLoadout[] = loadouts.map(
      (loadout) => ({
        ...loadout,
        validation: { status: "unchecked", errors: [] },
      }),
    );
    const html = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState(),
        loadouts: uncheckedLoadouts,
        loadoutsStatus: "ready",
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.doesNotMatch(
      html,
      /deck-loadout-option[^>]*disabled=""[\s\S]*Enel Yellow/u,
    );
    assert.doesNotMatch(html, /Checking deck/u);
    assert.doesNotMatch(
      html,
      /<button class="deck-loadout-submit-button modal-submit-button" type="submit" disabled="">Submit/u,
    );
  });

  test("renders loading deck status in the deck action row", () => {
    const html = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState(),
        loadouts,
        loadoutsStatus: "loading",
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.match(
      html,
      /<div class="deck-loadout-actions">[\s\S]*Open deck editor[\s\S]*<span class="deck-loadout-loading">Loading loadouts\.\.\.<\/span>[\s\S]*Refresh decks[\s\S]*<\/div>/u,
    );
  });

  test("disables deck refresh while loading, disabled, or locked", () => {
    const loading = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState(),
        loadouts,
        loadoutsStatus: "loading",
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );
    const disabled = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        disabled: true,
        lobbyState: lobbyState(),
        loadouts,
        loadoutsStatus: "ready",
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );
    const locked = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState({ selfDeckStatus: "ready" }),
        loadouts,
        loadoutsStatus: "ready",
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.match(
      loading,
      /<button class="deck-loadout-refresh-button" type="button" disabled="">Refresh decks<\/button>/u,
    );
    assert.match(
      disabled,
      /<button class="deck-loadout-refresh-button" type="button" disabled="">Refresh decks<\/button>/u,
    );
    assert.match(
      locked,
      /<button class="deck-loadout-refresh-button" type="button" disabled="">Refresh decks<\/button>/u,
    );
  });

  test("custom deck loadout picker scrolls internally inside a taller modal", async () => {
    const styles = await readFile(
      new URL("styles/controls.css", import.meta.url),
      "utf8",
    );

    assert.match(
      styles,
      /\.lobby-deck-modal\s*\{[^}]*height:\s*auto;[^}]*max-height:\s*min\(850px,\s*calc\(100vh - 24px\)\);/u,
    );
    assert.match(styles, /\.lobby-deck-modal\s*\{[^}]*overflow:\s*hidden;/u);
    assert.match(
      styles,
      /\.deck-loadout-menu\s*\{[^}]*grid-template-rows:\s*0fr;[^}]*transition:\s*grid-template-rows 130ms ease,\s*opacity 90ms ease;/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-menu\.is-open\s*\{[^}]*grid-template-rows:\s*1fr;/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-menu-inner\s*\{[^}]*overflow:\s*hidden;/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-folder-body\s*\{[^}]*grid-template-rows:\s*0fr;[^}]*transition:\s*grid-template-rows 130ms ease,\s*opacity 90ms ease;/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-folder-body\.is-open\s*\{[^}]*grid-template-rows:\s*1fr;/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-folder-list\s*\{[^}]*overflow:\s*auto;/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-options\s*\{[^}]*padding-left:\s*20px;/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-search\s*\{[^}]*min-height:\s*42px;[^}]*font-size:\s*15px;[^}]*resize:\s*none;/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-search:focus\s*\{[^}]*outline:\s*0;[^}]*box-shadow:\s*0 0 0 1px rgba\(0,\s*0,\s*0,\s*0\.72\),\s*0 0 0 3px rgba\(255,\s*255,\s*255,\s*0\.72\);/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-folder-header\s*\{[^}]*min-height:\s*44px;[^}]*font-size:\s*16px;/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-folder-header span:last-child\s*\{[^}]*margin-right:\s*12px;/u,
    );
    assert.doesNotMatch(styles, /\.deck-status-list/u);
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
      /\.deck-loadout-option\s*\{[^}]*grid-template-columns:\s*112px minmax\(0,\s*1fr\);/u,
    );
    assert.match(
      styles,
      /\.deck-loadout-selected:hover:not\(:disabled\),\s*\.deck-loadout-option:hover:not\(:disabled\),\s*\.deck-loadout-option\.is-selected\s*\{[^}]*border-color:\s*var\(--match-border\);/u,
    );
    assert.doesNotMatch(
      styles,
      /\.deck-hash-form button\s*\{[^}]*background:/u,
    );
    assert.doesNotMatch(
      styles,
      /\.deck-loadout-submit-button\s*\{[^}]*background:/u,
    );
  });

  test("server ready deck status locks the picker and waits on the submit button", () => {
    const html = renderToStaticMarkup(
      createElement(LobbyDeckPanel, {
        lobbyState: lobbyState({ selfDeckStatus: "ready" }),
        loadouts,
        loadoutsStatus: "ready",
        onRefreshLoadouts: () => undefined,
        onSubmitLoadout: () => Promise.resolve(),
      }),
    );

    assert.doesNotMatch(html, /deck-status-list/u);
    assert.doesNotMatch(html, /Your deck/u);
    assert.doesNotMatch(html, /Opponent deck/u);
    assert.match(html, /class="deck-loadout-selected" type="button" disabled/u);
    assert.match(
      html,
      /class="deck-loadout-menu is-closed" aria-hidden="true"/u,
    );
    assert.match(
      html,
      /<button class="deck-loadout-submit-button modal-submit-button" type="submit" disabled="">Waiting for opponent/u,
    );
  });

  test("deck submit lock is derived from server lobby state", async () => {
    const source = await readFile(
      new URL("LobbyDeckPanel.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(source, /submittedLoadoutId/u);
    assert.doesNotMatch(source, /setSubmittedLoadoutId/u);
    assert.match(source, /const pickerLocked = selfDeckStatus === "ready";/u);
    assert.match(source, /locked=\{pickerLocked\}/u);
    assert.match(
      source,
      /selectedLoadoutExists\s*&&\s*selectedLoadoutPlayable\s*&&\s*!disabled\s*&&\s*!pickerLocked/u,
    );
  });

  test("deck refresh is wired from match client into the lobby deck panel", async () => {
    const matchAppSource = await readFile(
      new URL("MatchApp.tsx", import.meta.url),
      "utf8",
    );
    const clientSource = await readFile(
      new URL("useMatchClient.ts", import.meta.url),
      "utf8",
    );
    const supportSource = await readFile(
      new URL("useMatchClient-support.ts", import.meta.url),
      "utf8",
    );

    assert.match(supportSource, /refreshAccountLoadouts: \(\) => void;/u);
    assert.match(clientSource, /const refreshAccountLoadouts = useCallback/u);
    assert.match(
      clientSource,
      /accountClient\s*\.listLoadouts\(\{\s*includeDeckHashes: localRawDeckSubmissionsAllowed,\s*includeFolders: true,\s*\}\)/u,
    );
    assert.match(
      clientSource,
      /const loadoutsWithValidation =\s*loadoutsWithUncheckedValidation\(loadouts\);/u,
    );
    assert.match(
      clientSource,
      /setAccountLoadouts\(loadoutsWithValidation\);[\s\S]*setAccountLoadoutsStatus\("ready"\);/u,
    );
    assert.doesNotMatch(clientSource, /validateLoadoutPreview/u);
    assert.doesNotMatch(clientSource, /rememberLoadoutValidation\(\{/u);
    assert.doesNotMatch(clientSource, /for \(const loadout of loadouts\)/u);
    assert.doesNotMatch(clientSource, /setAccountLoadouts\(\(current\) =>/u);
    assert.doesNotMatch(clientSource, /accountClient\s*\.createSimHandoffs\(/u);
    assert.doesNotMatch(clientSource, /controller\.validateLobbyLoadouts\(/u);
    assert.doesNotMatch(clientSource, /controller\.validateLobbyDecks\(/u);
    assert.match(clientSource, /accountClient\s*\.createSimHandoff\(/u);
    assert.match(
      matchAppSource,
      /onRefreshLoadouts=\{client\.refreshAccountLoadouts\}/u,
    );
  });

  test("deck loadout folders initially expand only the first group", async () => {
    const source = await readFile(
      new URL("DeckLoadoutPicker.tsx", import.meta.url),
      "utf8",
    );

    assert.match(
      source,
      /const \[initializedFolderState,\s*setInitializedFolderState\]/u,
    );
    assert.match(
      source,
      /setClosedFolderKeys\(new Set\(groups\.slice\(1\)\.map\(\(group\) => group\.key\)\)\);/u,
    );
    assert.match(source, /setInitializedFolderState\(true\);/u);
  });

  test("deck loadout picker does not expose an illegal-deck filter for unchecked lists", async () => {
    const source = await readFile(
      new URL("LobbyDeckPanel.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(source, /hideIllegalLoadouts/u);
    assert.doesNotMatch(source, /setHideIllegalLoadouts/u);
    assert.doesNotMatch(source, /Hide illegal decks/u);
  });

  test("deck loadout picker allows unchecked loadouts and blocks explicit unplayable loadouts", async () => {
    const panelSource = await readFile(
      new URL("LobbyDeckPanel.tsx", import.meta.url),
      "utf8",
    );
    const pickerSource = await readFile(
      new URL("DeckLoadoutPicker.tsx", import.meta.url),
      "utf8",
    );

    assert.match(
      panelSource,
      /!requirePlayableValidation \|\|\s*selectedLoadout\?\.validation\?\.status === "playable" \|\|\s*selectedLoadout\?\.validation\?\.status === "unchecked"/u,
    );
    assert.match(pickerSource, /requirePlayableValidation = true/u);
    assert.match(
      pickerSource,
      /const isSelectableLoadout = \([\s\S]*loadout\.validation\?\.status === "playable" \|\|\s*loadout\.validation\?\.status === "unchecked"\);/u,
    );
  });

  test("deck loadout picker can be reused for disabled queue preselection", () => {
    const html = renderToStaticMarkup(
      createElement(DeckLoadoutPicker, {
        loadouts,
        requirePlayableValidation: false,
        selectedLoadoutId: "loadout-1",
        onChange: () => undefined,
      }),
    );

    assert.match(html, /deck-loadout-option[\s\S]*Enel Yellow/u);
    assert.doesNotMatch(
      html,
      /deck-loadout-option[^>]*disabled=""[\s\S]*Enel Yellow/u,
    );
  });
});
