import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { DashboardPageView } from "./DashboardPage.js";

test("private lobby creation can disable the match timer", () => {
  const html = renderToStaticMarkup(
    createElement(DashboardPageView, {
      mode: "privateLobby",
      formats: [],
      formatsStatus: "ready",
      selectedFormatName: "Anything Goes",
      loadouts: [],
      loadoutsStatus: "idle",
      selectedLoadoutId: "",
      privateLobbyTimerDisabled: true,
      privateLobbyBotOpponent: true,
      privateLobbyPassiveBot: true,
      onSelectMode: () => undefined,
      onSelectFormat: () => undefined,
      onSelectLoadout: () => undefined,
      onRefreshLoadouts: () => undefined,
      onSetPrivateLobbyTimerDisabled: () => undefined,
      onSetPrivateLobbyBotOpponent: () => undefined,
      onSetPrivateLobbyPassiveBot: () => undefined,
    }),
  );

  assert.match(html, /type="checkbox"[^>]*checked=""/u);
  assert.equal(html.includes("Disable timer"), true);
  assert.equal(html.includes("Play against bot"), true);
  assert.equal(html.includes("Passive bot"), true);
  assert.match(
    html,
    /href="\/match\?lobbyFormat=sandbox-open&amp;timerDisabled=1&amp;botOpponent=1&amp;passiveBot=1"/u,
  );
});

test("passive bot checkbox only appears when bot opponent is selected", () => {
  const html = renderToStaticMarkup(
    createElement(DashboardPageView, {
      mode: "privateLobby",
      formats: [],
      formatsStatus: "ready",
      selectedFormatName: "Anything Goes",
      loadouts: [],
      loadoutsStatus: "idle",
      selectedLoadoutId: "",
      privateLobbyTimerDisabled: false,
      privateLobbyBotOpponent: false,
      privateLobbyPassiveBot: true,
      onSelectMode: () => undefined,
      onSelectFormat: () => undefined,
      onSelectLoadout: () => undefined,
      onRefreshLoadouts: () => undefined,
      onSetPrivateLobbyTimerDisabled: () => undefined,
      onSetPrivateLobbyBotOpponent: () => undefined,
      onSetPrivateLobbyPassiveBot: () => undefined,
    }),
  );

  assert.equal(html.includes("Passive bot"), false);
  assert.doesNotMatch(html, /passiveBot=1/u);
});

test("dashboard deck selector loads deck-library loadouts with crop focus", () => {
  const source = readFileSync(
    new URL("DashboardPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /accountClient\s*\.listLoadouts\(\{\s*includeFolders:\s*true\s*\}\)/u,
  );
});
