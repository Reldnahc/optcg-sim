import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { AccountLoadout } from "../account-client.js";
import { AppShell } from "./AppShell.js";
import { DashboardPage, DashboardPageView } from "./DashboardPage.js";
import { NotFoundPage } from "./NotFoundPage.js";

const noop = (): void => undefined;

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
];

describe("client app shell pages", () => {
  test("dashboard exposes the play mode selector", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        children: createElement(DashboardPage),
      }),
    );

    assert.match(html, /Poneglyph Sim/u);
    assert.doesNotMatch(html, /aria-label="Primary"/u);
    assert.match(html, /Private Lobby/u);
    assert.match(html, /Unranked Queue/u);
    assert.match(html, /Ranked Queue/u);
    assert.match(html, /Anything Goes/u);
    assert.match(html, /Make Lobby/u);
    assert.match(html, /href="\/match\?lobbyFormat=sandbox-open"/u);
    assert.match(
      html,
      /<a class="deck-editor-link" href="https:\/\/poneglyph\.one\/decks" target="_blank" rel="noreferrer">Open deck editor<\/a>/u,
    );
    assert.doesNotMatch(html, /Profile/u);
  });

  test("queue modes show format and deck selection without enabling queues", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        children: createElement(DashboardPageView, {
          mode: "unrankedQueue",
          formats: [
            {
              name: "Standard",
              description: "Current official format",
              hasRotation: true,
              legalBlocks: 5,
              banCount: 2,
            },
          ],
          formatsStatus: "ready",
          selectedFormatName: "Standard",
          loadouts,
          loadoutsStatus: "ready",
          selectedLoadoutId: "loadout-1",
          privateLobbyTimerDisabled: false,
          privateLobbyBotOpponent: false,
          onSelectMode: noop,
          onSelectFormat: noop,
          onSelectLoadout: noop,
          onRefreshLoadouts: noop,
          onSetPrivateLobbyTimerDisabled: noop,
          onSetPrivateLobbyBotOpponent: noop,
        }),
      }),
    );

    assert.match(
      html,
      /<option value="Standard" selected="">Standard<\/option>/u,
    );
    assert.doesNotMatch(html, /Anything Goes/u);
    assert.match(html, /deck-loadout-picker/u);
    assert.match(html, /Enel Yellow/u);
    assert.match(html, /Queue coming soon/u);
    assert.match(
      html,
      /<button class="shell-card-action is-disabled" disabled="">Queue coming soon<\/button>/u,
    );
    assert.doesNotMatch(html, /href="\/match"[\s\S]*Queue coming soon/u);
  });

  test("not-found page links back to the dashboard", () => {
    const html = renderToStaticMarkup(
      createElement(AppShell, {
        children: createElement(NotFoundPage, { path: "/missing" }),
      }),
    );

    assert.match(html, /Page not found/u);
    assert.match(html, /href="\//u);
  });
});
